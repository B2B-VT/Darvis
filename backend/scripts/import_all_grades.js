// scripts/import_all_grades.js
//
// Imports vt_grade_distribution_2020-21_to_2025-26.csv into Supabase.
// CSV columns differ from the old UDC format — this script maps them correctly.
//
// Run: node scripts/import_all_grades.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const CSV_FILE = path.join(__dirname, '../data/raw/vt_grade_distribution_2020-21_to_2025-26.csv');

// ── CSV parsing ────────────────────────────────────────────────────────────────

function parseCSVRow(line) {
  const cols = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cols.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function parseCSV(text) {
  const lines  = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const header = parseCSVRow(lines[0]);
  const rows   = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVRow(line);
    const obj    = {};
    header.forEach((h, idx) => { obj[h] = values[idx] ?? ''; });
    rows.push(obj);
  }
  return rows;
}

function toFloat(s) { const n = parseFloat(s); return isNaN(n) ? null : n; }
function toInt(s)   { const n = parseInt(s, 10); return isNaN(n) ? null : n; }

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`CSV not found: ${CSV_FILE}`);
    process.exit(1);
  }

  console.log(`Reading ${CSV_FILE}...`);
  const text = fs.readFileSync(CSV_FILE, 'utf8');
  const rows = parseCSV(text);
  console.log(`Parsed ${rows.length} rows.\n`);

  // Map new CSV columns → Supabase grades columns
  const records = [];
  let skippedNoKey = 0;

  for (const r of rows) {
    const subject  = (r.subject_code || '').trim().toUpperCase();
    const courseNo = (r.course_number || '').trim();
    if (!subject || !courseNo) { skippedNoKey++; continue; }

    records.push({
      academic_year:     r.academic_year     || null,
      term:              r.term              || null,
      subject:           subject,
      course_number:     courseNo,
      course_title:      r.course_title      || null,
      instructor:        r.instructor        || null,
      crn:               r.course_ref_no     || null,
      credits:           toFloat(r.credit_hours),
      graded_enrollment: toInt(r.student_no),
      gpa:               toFloat(r.gpa),
      a_pct:             toFloat(r.grade_a),
      a_minus_pct:       toFloat(r.grade_a_negative),
      b_plus_pct:        toFloat(r.grade_b_positive),
      b_pct:             toFloat(r.grade_b),
      b_minus_pct:       toFloat(r.grade_b_negative),
      c_plus_pct:        toFloat(r.grade_c_positive),
      c_pct:             toFloat(r.grade_c),
      c_minus_pct:       toFloat(r.grade_c_negative),
      d_plus_pct:        toFloat(r.grade_d_positive),
      d_pct:             toFloat(r.grade_d),
      d_minus_pct:       toFloat(r.grade_d_negative),
      f_pct:             toFloat(r.grade_f),
      withdraws:         toInt(r.withdraws),
    });
  }

  if (skippedNoKey > 0) console.log(`Skipped ${skippedNoKey} rows missing subject/course_number.\n`);
  console.log(`Importing ${records.length} grade records in batches of 500...\n`);

  const CHUNK = 500;
  let inserted = 0, duplicates = 0, errors = 0;

  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('grades')
      .upsert(chunk, {
        onConflict:       'academic_year,term,subject,course_number,instructor,crn',
        ignoreDuplicates: true,
      })
      .select('id');

    if (error) {
      console.error(`  Chunk ${i}-${i + CHUNK}: ERROR — ${error.message}`);
      errors++;
    } else {
      const n = data ? data.length : 0;
      inserted   += n;
      duplicates += chunk.length - n;
    }

    if ((i / CHUNK) % 20 === 0) {
      process.stdout.write(`  ${inserted.toLocaleString()} inserted so far...\r`);
    }
  }

  console.log(`\nGrade import complete:`);
  console.log(`  Inserted:   ${inserted.toLocaleString()}`);
  console.log(`  Duplicates: ${duplicates.toLocaleString()}`);
  console.log(`  Errors:     ${errors}`);

  console.log('\nAggregating courses table (avg GPA, A-rate, etc. per course)...');
  const { error: rpcErr } = await supabase.rpc('aggregate_courses');
  if (rpcErr) {
    console.error('aggregate_courses() failed:', rpcErr.message);
  } else {
    const { count } = await supabase.from('courses').select('*', { count: 'exact', head: true });
    console.log(`Done. courses table now has ${count} unique courses with aggregated grade stats.`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
