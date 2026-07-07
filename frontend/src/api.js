// src/api.js
// Query functions for the Darvis frontend.
// All functions return data in the shape the existing components expect.
import { db } from "./supabase.js";
import { DARVIS_CONFIG } from "./config.js";

const CHAT_API_BASE = (DARVIS_CONFIG.chatApiUrl || "").replace(/\/chat\/?$/, "");
const CURRENT_SECTIONS_TERM = "202609";
let currentSectionCountsPromise = null;

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
      return row ? enrichCurrentSectionCounts([formatCourse(row)]) : [];
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

    return enrichCurrentSectionCounts(allData.map(formatCourse));
  },

  // Returns all instructors from the instructors table.
  // Paginated in 1000-row pages to bypass Supabase default row limit.
  async getInstructors() {
    const PAGE = 1000;
    let all = [], from = 0;
    while (true) {
      const { data, error } = await db
        .from('instructors')
        .select('*')
        .order('name')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all = all.concat(data || []);
      if ((data || []).length < PAGE) break;
      from += PAGE;
    }
    return all.map(r => ({
      name:          r.name,
      department:    r.dept || '',
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
    const { data, error } = await db.rpc('get_distinct_subjects');
    if (error) throw error;
    return (data || []).map(r => r.subject);
  },

  // Live data for the landing page marquee. Kept intentionally small so the
  // public homepage can show real course/professor signals without pulling the
  // full catalog or instructor directory.
  async getLandingMarqueeData() {
    const subjectPool = [
      'CS', 'BIT', 'MATH', 'STAT', 'PHYS', 'CHEM', 'BIOL', 'ECE',
      'ACIS', 'ECON', 'ENGL', 'HIST', 'PSYC', 'FIN', 'MGT', 'MKTG',
      'CMDA', 'COMM', 'AAD', 'HTM',
    ];

    const [courseResults, instructorRes] = await Promise.all([
      Promise.all(subjectPool.map(subject => db
        .from('courses')
        .select('id, subject, course_number, title, credits, avg_gpa, description, pathways')
        .eq('subject', subject)
        .not('avg_gpa', 'is', null)
        .gte('avg_gpa', 2.35)
        .order('course_number')
        .limit(14)
      )),
      db
        .from('instructors')
        .select('name, dept, subjects, avg_gpa, rmp_rating, rmp_difficulty, rmp_count, rmp_tags, rmp_reviews, rmp_id')
        .not('rmp_rating', 'is', null)
        .not('rmp_difficulty', 'is', null)
        .not('avg_gpa', 'is', null)
        .order('rmp_count', { ascending: false })
        .limit(60),
    ]);
    const courseError = courseResults.find(result => result.error)?.error;
    if (courseError) throw courseError;
    if (instructorRes.error) throw instructorRes.error;

    const courses = chooseLandingCourses(courseResults.flatMap(result => result.data || [])).slice(0, 8);
    const enrichedCourses = await Promise.all(courses.map(async row => {
      const base = formatCourse(row);
      const { data: grades } = await db
        .from('grades')
        .select('instructor, gpa, graded_enrollment, a_pct, a_minus_pct, b_plus_pct, b_pct, b_minus_pct, c_plus_pct, c_pct, c_minus_pct, d_plus_pct, d_pct, d_minus_pct, f_pct')
        .eq('subject', row.subject)
        .eq('course_number', row.course_number);

      const rows = grades || [];
      const totalStudents = rows.reduce((sum, r) => sum + (Number(r.graded_enrollment) || 0), 0);
      const instructors = new Set(rows.map(r => r.instructor).filter(Boolean));
      const weighted = fields => {
        if (!totalStudents) return 0;
        return rows.reduce((sum, r) => {
          const enrollment = Number(r.graded_enrollment) || 0;
          const pct = fields.reduce((inner, field) => inner + (Number(r[field]) || 0), 0);
          return sum + pct * enrollment;
        }, 0) / totalStudents;
      };
      const distRaw = [
        weighted(['a_pct', 'a_minus_pct']),
        weighted(['b_plus_pct', 'b_pct', 'b_minus_pct']),
        weighted(['c_plus_pct', 'c_pct', 'c_minus_pct']),
        weighted(['d_plus_pct', 'd_pct', 'd_minus_pct']),
        weighted(['f_pct']),
      ];
      const distTotal = distRaw.reduce((sum, n) => sum + n, 0) || 1;
      const dist = distRaw.map(n => Math.round((n / distTotal) * 100));
      const correction = 100 - dist.reduce((sum, n) => sum + n, 0);
      dist[0] += correction;

      return {
        ...base,
        code: `${base.subject} ${base.number}`,
        profs: instructors.size || base.totalSections || 0,
        n: totalStudents,
        dist,
      };
    }));

    const instructors = chooseLandingInstructors(instructorRes.data || []).slice(0, 8).map(r => ({
      name:          r.name,
      department:    r.dept || '',
      dept:          r.dept || (Array.isArray(r.subjects) ? r.subjects[0] : '') || '',
      subjects:      r.subjects || [],
      courseCount:   0,
      avgGpa:        r.avg_gpa != null ? parseFloat(r.avg_gpa) : null,
      rmpRating:     r.rmp_rating != null ? parseFloat(r.rmp_rating) : null,
      rmpDifficulty: r.rmp_difficulty != null ? parseFloat(r.rmp_difficulty) : null,
      rmpCount:      r.rmp_count || 0,
      rmpTags:       Array.isArray(r.rmp_tags) ? r.rmp_tags : [],
      rmpReviews:    Array.isArray(r.rmp_reviews) ? r.rmp_reviews : [],
      rmpId:         r.rmp_id || null,
    }));

    return { courses: enrichedCourses, instructors };
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

  // Re-fetches fresh section data (instructor, seats, enrolled) for a list of CRNs.
  async getSectionsByCrns(crns, term = '202609') {
    if (!crns.length) return [];
    const { data, error } = await db
      .from('sections')
      .select('crn, subject, course_number, term, instructor, days, start_time, end_time, location, seats, enrolled, credits')
      .in('crn', crns)
      .eq('term', term);
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
    const [courseRes, gradesRes, sectRes] = await Promise.all([
      db.from('courses').select('*').eq('subject', subject.toUpperCase()).eq('course_number', number).single(),
      db.from('grades').select('*').eq('subject', subject.toUpperCase()).eq('course_number', number)
        .order('academic_year', { ascending: false }).order('term', { ascending: false }),
      // Fetch Banner instructor names (initials+last format) from Fall 2026 sections
      db.from('sections').select('instructor')
        .eq('subject', subject.toUpperCase()).eq('course_number', number)
        .eq('term', '202609').not('instructor', 'is', null),
    ]);
    if (courseRes.error) throw courseRes.error;
    const course = formatCourse(courseRes.data);
    const grades = gradesRes.data || [];

    // Both grades.instructor and sections.instructor now store canonical names
    // matching instructors.name exactly — plain set union then direct .in() lookup.
    const allNames = [...new Set([
      ...grades.map(r => r.instructor).filter(Boolean),
      ...(sectRes.data || []).map(r => r.instructor).filter(Boolean),
    ])];

    const rmpMap = {};
    if (allNames.length > 0) {
      const { data: rows } = await db.from('instructors')
        .select('name, rmp_rating, rmp_difficulty, rmp_count, rmp_tags, rmp_reviews, rmp_id')
        .in('name', allNames);
      (rows || []).forEach(r => { rmpMap[r.name] = r; });
    }

    course.instructors = [...new Set(grades.map(r => r.instructor).filter(Boolean))].sort();
    course.rmpMap = rmpMap;
    course.gradesByTerm = buildTermTrend(grades);

    // Store canonical name in rawSections so the Instructors tab and grade breakdown
    // display "John Lewis" instead of the raw last-name-only "Lewis" from the CSV.
    course.rawSections = grades.map(r => ({
      academicYear:     r.academic_year,
      term:             r.term,
      crn:              r.crn,
      instructor:       rmpMap[r.instructor]?.name || r.instructor || 'Unknown',
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

  async getRmpReviews(rmpId, limit = 12) {
    if (!rmpId || !CHAT_API_BASE) return [];
    const url = `${CHAT_API_BASE}/rmp/reviews?rmp_id=${encodeURIComponent(rmpId)}&limit=${encodeURIComponent(limit)}`;
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) throw new Error("Unable to fetch RateMyProfessors reviews.");
    const payload = await response.json();
    return Array.isArray(payload?.reviews) ? payload.reviews : [];
  },

  async getLiveCourseDescription(subject, number) {
    if (!subject || !number || !CHAT_API_BASE) return null;
    const params = new URLSearchParams({
      subject: String(subject).toUpperCase(),
      number: String(number),
    });
    const response = await fetch(`${CHAT_API_BASE}/catalog/course-description?${params.toString()}`, {
      method: "GET",
    });
    if (!response.ok) throw new Error("Unable to fetch catalog description.");
    const payload = await response.json();
    return {
      description: payload?.description || "",
      source: payload?.source || "Virginia Tech Catalog",
      sourceUrl: payload?.source_url || "",
      cached: Boolean(payload?.cached),
    };
  },

  async getEchoReviews({ targetType, professorName, subject, number, limit = 20 } = {}) {
    let query = db
      .from('echo_reviews')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (targetType) query = query.eq('target_type', targetType);
    if (professorName) query = query.eq('professor_name', professorName);
    if (subject) query = query.eq('course_subject', subject);
    if (number) query = query.eq('course_number', number);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(formatEchoReview);
  },

  async createEchoReview(review) {
    const payload = {
      user_id:              review.userId,
      display_name:         review.displayName || '',
      target_type:          review.targetType,
      professor_name:       review.professorName || null,
      course_subject:       review.courseSubject || null,
      course_number:        review.courseNumber || null,
      course_title:         review.courseTitle || null,
      quality_rating:       review.qualityRating,
      difficulty_rating:    review.difficultyRating,
      would_take_again:     review.wouldTakeAgain,
      for_credit:           review.forCredit,
      used_textbook:        review.usedTextbook,
      attendance_mandatory: review.attendanceMandatory,
      grade_received:       review.gradeReceived || null,
      tags:                 review.tags || [],
      review_text:          review.reviewText,
      status:               review.status || 'published',
      updated_at:           new Date().toISOString(),
    };
    const { data, error } = await db.from('echo_reviews').insert([payload]).select().single();
    if (error) throw error;
    return formatEchoReview(data);
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
    credits:       row.credits   ?? null,
    avgGpa:        row.avg_gpa   || 0,
    description:   row.description || '',
    pathways:      row.pathways  || [],
    totalSections: row.total_sections || 0,
    fallSections:  row.fall_sections  || 0,
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

async function getCurrentSectionCounts() {
  if (!currentSectionCountsPromise) {
    currentSectionCountsPromise = (async () => {
      const PAGE = 1000;
      let from = 0;
      const counts = new Map();
      while (true) {
        const { data, error } = await db
          .from('sections')
          .select('subject, course_number')
          .eq('term', CURRENT_SECTIONS_TERM)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = data || [];
        rows.forEach(row => {
          const key = `${row.subject}::${row.course_number}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        });
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return counts;
    })();
  }
  return currentSectionCountsPromise;
}

async function enrichCurrentSectionCounts(courses) {
  if (!courses.length) return courses;
  const counts = await getCurrentSectionCounts();
  return courses.map(course => ({
    ...course,
    fallSections: counts.get(`${course.subject}::${course.number}`) || 0,
  }));
}

function chooseLandingCourses(rows) {
  const useful = rows
    .filter(r => r.subject && r.course_number && r.title && r.avg_gpa != null)
    .sort((a, b) => {
      const aLevel = parseInt(String(a.course_number).match(/\d/) ? a.course_number : '9999', 10);
      const bLevel = parseInt(String(b.course_number).match(/\d/) ? b.course_number : '9999', 10);
      return aLevel - bLevel || String(a.title).localeCompare(String(b.title));
    });
  const bySubject = useful.reduce((map, row) => {
    if (!map[row.subject]) map[row.subject] = [];
    map[row.subject].push(row);
    return map;
  }, {});

  const onePerSubject = shuffle([...Object.values(bySubject)])
    .map(subjectRows => shuffle(subjectRows)[0])
    .filter(Boolean);

  const picked = onePerSubject.slice(0, 8);
  for (const row of shuffle(useful)) {
    const key = `${row.subject} ${row.course_number}`;
    if (picked.some(c => `${c.subject} ${c.course_number}` === key)) continue;
    picked.push(row);
    if (picked.length >= 8) break;
  }
  return picked;
}

function chooseLandingInstructors(rows) {
  const byDept = rows
    .filter(r => r.name && r.rmp_rating != null && r.rmp_difficulty != null && r.avg_gpa != null)
    .reduce((map, row) => {
      const dept = row.dept || (Array.isArray(row.subjects) ? row.subjects[0] : '') || 'VT';
      if (!map[dept]) map[dept] = [];
      map[dept].push(row);
      return map;
    }, {});

  return shuffle([...Object.values(byDept)])
    .map(deptRows => shuffle(deptRows)[0])
    .filter(Boolean);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatEchoReview(row) {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name || 'Darvis student',
    targetType: row.target_type,
    professorName: row.professor_name,
    courseSubject: row.course_subject,
    courseNumber: row.course_number,
    courseTitle: row.course_title,
    qualityRating: row.quality_rating != null ? parseFloat(row.quality_rating) : null,
    difficultyRating: row.difficulty_rating != null ? parseFloat(row.difficulty_rating) : null,
    wouldTakeAgain: row.would_take_again,
    forCredit: row.for_credit,
    usedTextbook: row.used_textbook,
    attendanceMandatory: row.attendance_mandatory,
    gradeReceived: row.grade_received,
    tags: Array.isArray(row.tags) ? row.tags : [],
    reviewText: row.review_text || '',
    createdAt: row.created_at,
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
