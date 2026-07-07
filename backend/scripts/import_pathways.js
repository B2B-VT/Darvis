// scripts/import_pathways.js
//
// Reads backend/data/raw/course_pathways.json (from npm run scrape-pathways)
// and upserts VT Pathways concept-area codes into the `courses.pathways`
// array column.
//
// Run with: npm run import-pathways

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

const db      = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const IN_FILE = path.join(__dirname, '../data/raw/course_pathways.json');

async function main() {
  if (!fs.existsSync(IN_FILE)) {
    console.error(`Input file not found: ${IN_FILE}`);
    console.error('Run: npm run scrape-pathways  first.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(IN_FILE, 'utf8'));
  const withPathways = raw.filter(r => Array.isArray(r.pathways) && r.pathways.length > 0);
  console.log(`Loaded ${raw.length} entries, ${withPathways.length} have pathway codes\n`);

  let written = 0, failed = 0, noMatch = 0;

  for (let i = 0; i < withPathways.length; i++) {
    const { subject, courseNumber, pathways } = withPathways[i];

    const { data, error } = await db
      .from('courses')
      .update({ pathways })
      .eq('subject', subject.toUpperCase())
      .eq('course_number', courseNumber.trim())
      .select('id');

    if (error) {
      console.warn(`  [${subject} ${courseNumber}] error: ${error.message}`);
      failed++;
    } else if (!data || data.length === 0) {
      noMatch++;
    } else {
      written++;
    }

    if ((i + 1) % 25 === 0 || i === withPathways.length - 1) {
      process.stdout.write(`  ${i + 1}/${withPathways.length} processed\r`);
    }
  }

  console.log(`\n\nDone.`);
  console.log(`  Written:        ${written}`);
  if (noMatch > 0) console.log(`  No DB match:    ${noMatch}`);
  if (failed  > 0) console.log(`  Errors:         ${failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
