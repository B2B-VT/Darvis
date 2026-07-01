// scripts/rebuild_instructors.js
//
// Rebuilds the instructors table from three sources:
//   1. sections table  — instructor names in "Initials LastName" format (e.g. "C Tao")
//   2. grades table    — last-name-only stats (avg_gpa, subjects, course_count)
//   3. RMP JSON        — ratings from rmp_scraper.js (matched by last name)
//
// Run: node scripts/rebuild_instructors.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RMP_JSON      = path.join(__dirname, '../data/raw/rmp_vt_professors.json');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

function lastName(name) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function loadRmpIndex() {
  if (!fs.existsSync(RMP_JSON)) {
    console.warn('RMP JSON not found — run rmp_scraper.js first. Skipping RMP matching.');
    return new Map();
  }
  const professors = JSON.parse(fs.readFileSync(RMP_JSON, 'utf8'));
  console.log(`Loaded ${professors.length} professors from RMP JSON.`);
  const index = new Map();
  for (const p of professors) {
    const key = normName(p.last_name || '');
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(p);
  }
  return index;
}

function matchRmp(lastNameStr, rmpIndex) {
  const key = normName(lastNameStr);
  const candidates = rmpIndex.get(key) ?? [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return candidates.sort((a, b) => (b.num_ratings ?? 0) - (a.num_ratings ?? 0))[0];
}

async function fetchAll(table, select, filters = []) {
  const PAGE = 1000; // Supabase hard max per request
  let all = [], from = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    for (const [col, op, val] of filters) {
      if (op === 'not.is') q = q.not(col, 'is', val);
      else if (op === 'neq')  q = q.neq(col, val);
    }
    const { data, error } = await q;
    if (error) throw new Error(`${table} fetch error: ${error.message}`);
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
    process.stdout.write(`\r  ${all.length.toLocaleString()} rows...`);
  }
  return all;
}

(async () => {
  console.log('=== Rebuild Instructors ===\n');

  const rmpIndex = loadRmpIndex();
  console.log(`RMP index covers ${rmpIndex.size} unique last names.\n`);

  // Load grades stats
  console.log('Loading grades...');
  const gradeRows = await fetchAll('grades', 'instructor,subject,gpa,graded_enrollment', [
    ['instructor', 'not.is', null],
    ['instructor', 'neq', ''],
  ]);
  console.log(`  ${gradeRows.length} grade rows loaded.`);

  const gradeStats = new Map();
  for (const row of gradeRows) {
    const ln = normName(lastName(row.instructor || ''));
    if (!ln) continue;
    if (!gradeStats.has(ln)) {
      gradeStats.set(ln, { totalGpaWeight: 0, totalEnroll: 0, subjects: new Set(), courseCount: 0 });
    }
    const s = gradeStats.get(ln);
    const enroll = row.graded_enrollment ?? 0;
    const gpa    = row.gpa ?? 0;
    if (enroll > 0 && gpa > 0) { s.totalGpaWeight += gpa * enroll; s.totalEnroll += enroll; }
    if (row.subject) s.subjects.add(row.subject.trim());
    s.courseCount++;
  }
  console.log(`  Aggregated stats for ${gradeStats.size} unique last names.\n`);

  // Load section instructors
  console.log('Loading section instructors...');
  const sectionRows = await fetchAll('sections', 'instructor', [
    ['instructor', 'not.is', null],
    ['instructor', 'neq', ''],
    ['instructor', 'neq', 'Staff'],
  ]);
  const uniqueSectionInstructors = [...new Set(sectionRows.map(r => r.instructor).filter(Boolean))];
  console.log(`  ${uniqueSectionInstructors.length} unique named instructors in sections.\n`);

  const toUpsert = [];
  const sectionLastNames = new Set();

  for (const name of uniqueSectionInstructors) {
    const ln    = normName(lastName(name));
    const stats = gradeStats.get(ln);
    const rmp   = matchRmp(ln, rmpIndex);
    sectionLastNames.add(ln);

    const avgGpa = stats && stats.totalEnroll > 0
      ? Math.round((stats.totalGpaWeight / stats.totalEnroll) * 1000) / 1000
      : null;

    const record = {
      name,
      subjects:     stats ? [...stats.subjects].sort() : [],
      course_count: stats ? stats.courseCount : 0,
      avg_gpa:      avgGpa,
      last_updated: new Date().toISOString(),
    };
    if (rmp) {
      record.rmp_id         = String(rmp.rmp_id);
      record.rmp_rating     = rmp.avg_rating ?? null;
      record.rmp_difficulty = rmp.avg_difficulty ?? null;
      record.rmp_count      = rmp.num_ratings ?? 0;
    }
    toUpsert.push(record);
  }

  // Grade-only instructors (not in Fall 2026 sections)
  let gradeOnlyCount = 0;
  for (const [ln, stats] of gradeStats.entries()) {
    if (sectionLastNames.has(ln)) continue;
    const name   = ln.charAt(0).toUpperCase() + ln.slice(1);
    const rmp    = matchRmp(ln, rmpIndex);
    const avgGpa = stats.totalEnroll > 0
      ? Math.round((stats.totalGpaWeight / stats.totalEnroll) * 1000) / 1000
      : null;

    const record = {
      name,
      subjects:     [...stats.subjects].sort(),
      course_count: stats.courseCount,
      avg_gpa:      avgGpa,
      last_updated: new Date().toISOString(),
    };
    if (rmp) {
      record.rmp_id         = String(rmp.rmp_id);
      record.rmp_rating     = rmp.avg_rating ?? null;
      record.rmp_difficulty = rmp.avg_difficulty ?? null;
      record.rmp_count      = rmp.num_ratings ?? 0;
    }
    toUpsert.push(record);
    gradeOnlyCount++;
  }

  console.log(`Records to upsert: ${toUpsert.length}`);
  console.log(`  From sections:  ${uniqueSectionInstructors.length}`);
  console.log(`  Grade-only:     ${gradeOnlyCount}\n`);

  const CHUNK = 100;
  let upserted = 0, errors = 0;

  for (let i = 0; i < toUpsert.length; i += CHUNK) {
    const chunk = toUpsert.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('instructors')
      .upsert(chunk, { onConflict: 'name', ignoreDuplicates: false });

    if (error) {
      console.error(`\n  Chunk ${Math.floor(i / CHUNK) + 1} error:`, error.message);
      errors++;
    } else {
      upserted += chunk.length;
      process.stdout.write(`\r  ${upserted} / ${toUpsert.length} upserted...`);
    }
  }

  const rmpCount = toUpsert.filter(r => r.rmp_rating != null).length;

  console.log(`\n\nDone.`);
  console.log(`  Total upserted: ${upserted}`);
  console.log(`  With RMP data:  ${rmpCount}`);
  console.log(`  Errors:         ${errors}`);

  const { count: total }    = await supabase.from('instructors').select('*', { count: 'exact', head: true });
  const { count: withRmp }  = await supabase.from('instructors').select('*', { count: 'exact', head: true }).not('rmp_rating', 'is', null);
  console.log(`\nInstructors table now has ${total} rows, ${withRmp} with RMP ratings.`);
})().catch(err => { console.error(err); process.exit(1); });
