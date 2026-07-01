// src/api.js
// Query functions for the Darvis frontend.
// All functions return data in the shape the existing components expect.
import { db } from "./supabase.js";

export const API = {

  // Returns courses matching the given filters.
  // Filtering happens server-side in Supabase — fast even with a large table.
  // Fetches in batches of 1000 and loops until the table is exhausted, so
  // the full catalog is always returned regardless of how many courses exist.
  async getCourses({ q, subjects, minGpa, minCredits, pathway } = {}) {
    // CRN shortcut: if the query is purely numeric treat it as a CRN lookup.
    // Sections live in a separate table, so we resolve subject+course_number
    // from there and return the matching course row directly.
    if (q && /^\d+$/.test(q.trim())) {
      const { data: sec } = await db
        .from('sections')
        .select('subject, course_number')
        .eq('crn', parseInt(q.trim(), 10))
        .limit(1)
        .maybeSingle();
      if (!sec) return [];
      const { data: row } = await db
        .from('courses')
        .select('*')
        .eq('subject', sec.subject)
        .eq('course_number', sec.course_number)
        .maybeSingle();
      return row ? [formatCourse(row)] : [];
    }

    const BATCH = 1000;
    let allData = [];
    let offset  = 0;

    while (true) {
      let query = db.from('courses').select('*');

      if (subjects && subjects.length) {
        query = query.in('subject', subjects);
      }
      if (minGpa) {
        query = query.gte('avg_gpa', parseFloat(minGpa));
      }
      if (minCredits) {
        const c = parseInt(minCredits);
        if (c >= 4) {
          // "4+" — everything 4 credits or more
          query = query.gte('credits', 3.6);
        } else {
          // Exact match with ±0.4 bracket for 1, 2, 3
          query = query.gte('credits', c - 0.4).lte('credits', c + 0.4);
        }
      }
      if (pathway) {
        // Postgres array containment: pathways @> ARRAY['5a']
        query = query.contains('pathways', [pathway]);
      }
      if (q && q.trim()) {
        const safe = q.trim().replace(/[%_]/g, '\\$&');
        const parts = safe.split(/\s+/);
        let orFilter = `title.ilike.%${safe}%,course_number.ilike.%${safe}%,subject.ilike.%${safe}%`;
        if (parts.length >= 2) {
          // Handle "CS 1014" style queries — first token is subject, rest is course number
          const subj = parts[0];
          const num  = parts.slice(1).join(' ');
          orFilter += `,and(subject.ilike.%${subj}%,course_number.ilike.%${num}%)`;
        }
        query = query.or(orFilter);
      }

      query = query
        .order('subject')
        .order('course_number')
        .range(offset, offset + BATCH - 1);

      const { data, error } = await query;
      if (error) throw error;

      const rows = data || [];
      allData = allData.concat(rows);

      // If we got fewer rows than the batch size, we've hit the end.
      if (rows.length < BATCH) break;
      offset += BATCH;
    }

    return allData.map(formatCourse);
  },

  // Returns all instructors from the instructors table.
  // Filtering is done client-side — the dataset is small enough (~200 rows).
  async getInstructors() {
    const { data, error } = await db
      .from('instructors')
      .select('*')
      .order('name');
    if (error) throw error;
    return (data || []).map(r => ({
      name:          r.name,
      subjects:      r.subjects || [],
      courseCount:   r.course_count || 0,
      avgGpa:        r.avg_gpa != null ? parseFloat(r.avg_gpa) : null,
      rmpRating:     r.rmp_rating != null ? parseFloat(r.rmp_rating) : null,
      rmpDifficulty: r.rmp_difficulty != null ? parseFloat(r.rmp_difficulty) : null,
      rmpCount:      r.rmp_count || 0,
      rmpTags:       Array.isArray(r.rmp_tags) ? r.rmp_tags : [],
      rmpReviews:    Array.isArray(r.rmp_reviews) ? r.rmp_reviews : [],
      rmpId:         r.rmp_id || null,
    }));
  },

  // Returns the distinct subject codes present in the courses table.
  async getSubjects() {
    const { data, error } = await db
      .from('courses')
      .select('subject')
      .order('subject');
    if (error) throw error;
    return [...new Set((data || []).map(r => r.subject))];
  },

  // Returns Fall 2026 sections for a given course from the sections table.
  // Sections are sorted by start_time then instructor.
  async getSections(subject, courseNumber, term = '202609') {
    const { data, error } = await db
      .from('sections')
      .select('crn, subject, course_number, term, instructor, days, start_time, end_time, location, seats, enrolled, credits')
      .eq('subject', subject.toUpperCase())
      .eq('course_number', courseNumber)
      .eq('term', term)
      .order('start_time', { ascending: true })
      .order('instructor', { ascending: true });
    if (error) throw error;
    return (data || []).map(r => ({
      crn:          r.crn,
      subject:      r.subject,
      courseNumber: r.course_number,
      term:         r.term,
      instructor:   r.instructor || 'Staff',
      days:         r.days || [],
      startTime:    r.start_time || '',
      endTime:      r.end_time   || '',
      location:     r.location   || 'TBA',
      seats:        r.seats      || 0,
      enrolled:     r.enrolled   || 0,
      credits:      r.credits    || 0,
    }));
  },

  // Returns a single course by subject + course_number, plus its raw grade rows
  // and RMP data for each instructor.
  async getCourse(subject, number) {
    const [courseRes, gradesRes] = await Promise.all([
      db
        .from('courses')
        .select('*')
        .eq('subject', subject.toUpperCase())
        .eq('course_number', number)
        .single(),
      db
        .from('grades')
        .select('*')
        .eq('subject', subject.toUpperCase())
        .eq('course_number', number)
        .order('academic_year', { ascending: false })
        .order('term', { ascending: false }),
    ]);
    if (courseRes.error) throw courseRes.error;
    const course = formatCourse(courseRes.data);
    const grades = gradesRes.data || [];

    // Distinct instructors
    const instructorNames = [...new Set(grades.map(r => r.instructor).filter(Boolean))];
    course.instructors = instructorNames.slice().sort();

    // Fetch RMP data for all instructors in one query
    let rmpMap = {};
    if (instructorNames.length > 0) {
      const { data: rmpRows } = await db
        .from('instructors')
        .select('name, rmp_rating, rmp_difficulty, rmp_count, rmp_tags, rmp_reviews, rmp_id')
        .in('name', instructorNames);
      if (rmpRows) {
        rmpRows.forEach(r => { rmpMap[r.name] = r; });
      }
    }
    course.rmpMap = rmpMap;

    // Grade trend by term
    course.gradesByTerm = buildTermTrend(grades);

    // Raw per-section rows for the breakdown table
    course.rawSections = grades.map(r => ({
      academicYear:     r.academic_year,
      term:             r.term,
      crn:              r.crn,
      instructor:       r.instructor || 'Unknown',
      gpa:              r.gpa != null ? parseFloat(r.gpa) : null,
      gradedEnrollment: r.graded_enrollment || 0,
      withdraws:        r.withdraws || 0,
      gradeDistribution: {
        'A':   r.a_pct        || 0,
        'A-':  r.a_minus_pct  || 0,
        'B+':  r.b_plus_pct   || 0,
        'B':   r.b_pct        || 0,
        'B-':  r.b_minus_pct  || 0,
        'C+':  r.c_plus_pct   || 0,
        'C':   r.c_pct        || 0,
        'C-':  r.c_minus_pct  || 0,
        'D+':  r.d_plus_pct   || 0,
        'D':   r.d_pct        || 0,
        'D-':  r.d_minus_pct  || 0,
        'F':   r.f_pct        || 0,
      },
    }));
    return course;
  },

  // ── Profile posts ──────────────────────────────────────────────────

  async createPost({ userId, displayName, headline, content, postType = 'general', imageUrl = '', linkUrl = '', linkTitle = '' }) {
    const { data, error } = await db.from('profile_posts').insert([{
      user_id:      userId,
      display_name: displayName,
      headline,
      content,
      post_type:    postType,
      image_url:    imageUrl,
      link_url:     linkUrl,
      link_title:   linkTitle,
    }]).select().single();
    if (error) throw error;
    return data;
  },

  async getPosts(userId) {
    const { data, error } = await db
      .from('profile_posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async deletePost(id) {
    const { error } = await db.from('profile_posts').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Schedule sync ──────────────────────────────────────────────────
  async getSchedule(userId) {
    const { data } = await db.from('user_schedules').select('sections').eq('user_id', userId).maybeSingle();
    return Array.isArray(data?.sections) ? data.sections : [];
  },

  async saveSchedule(userId, sections) {
    const { error } = await db.from('user_schedules').upsert(
      { user_id: userId, sections, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) throw error;
  },

  // ── Conversation sync ──────────────────────────────────────────────
  async getConversations(userId) {
    const { data } = await db.from('user_conversations')
      .select('session_id, title, messages, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    return data || [];
  },

  async saveConversation(userId, session) {
    await db.from('user_conversations').upsert(
      { user_id: userId, session_id: session.id, title: session.title,
        messages: session.messages, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,session_id' }
    );
  },

  async deleteConversation(userId, sessionId) {
    await db.from('user_conversations')
      .delete().eq('user_id', userId).eq('session_id', sessionId);
  },
};

// ── Helpers ────────────────────────────────────────────────────────

// Maps a Supabase courses row into the shape components expect.
function formatCourse(row) {
  return {
    id:            row.id,
    subject:       row.subject,
    number:        row.course_number,
    title:         row.title || `${row.subject} ${row.course_number}`,
    credits:       row.credits   || 3,
    avgGpa:        row.avg_gpa   || 0,
    description:   row.description || '',
    pathways:      row.pathways  || [],
    totalSections: row.total_sections || 0,
    // Grade distribution in the shape GradeGrid expects
    gradeDistribution: {
      'A':   row.a_pct        || 0,
      'A-':  row.a_minus_pct  || 0,
      'B+':  row.b_plus_pct   || 0,
      'B':   row.b_pct        || 0,
      'B-':  row.b_minus_pct  || 0,
      'C+':  row.c_plus_pct   || 0,
      'C':   row.c_pct        || 0,
      'C-':  row.c_minus_pct  || 0,
      'D+':  row.d_plus_pct   || 0,
      'D':   row.d_pct        || 0,
      'D-':  row.d_minus_pct  || 0,
      'F':   row.f_pct        || 0,
    },
    // Phase 2 (timetable) and Phase 3 (RMP) — not yet populated
    profIds:  [],
    sections: [],
  };
}

// Aggregates raw grade rows into a per-term summary for the trend chart.
function buildTermTrend(rows) {
  const byKey = {};
  for (const r of rows) {
    const key = `${r.academic_year}|${r.term}`;
    if (!byKey[key]) {
      byKey[key] = { term: r.term, academic_year: r.academic_year, gpas: [], sections: 0 };
    }
    if (r.gpa) byKey[key].gpas.push(r.gpa);
    byKey[key].sections++;
  }
  return Object.values(byKey).map(t => ({
    term:          t.term,
    academic_year: t.academic_year,
    avg_gpa:       t.gpas.length ? +(t.gpas.reduce((a, b) => a + b, 0) / t.gpas.length).toFixed(2) : null,
    sections:      t.sections,
  })).sort((a, b) => {
    if (b.academic_year !== a.academic_year) return b.academic_year > a.academic_year ? 1 : -1;
    return b.term > a.term ? 1 : -1;
  });
}
