// scripts/fetch_rmp_tags.js
//
// Fetches individual professor profiles from RMP to populate rmp_tags
// in the Supabase `instructors` table (which the chatbot reads).
//
// Run from the backend/ directory:
//   node scripts/fetch_rmp_tags.js
//
// Requirements: .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const RMP_GRAPHQL = 'https://www.ratemyprofessors.com/graphql';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Basic dGVzdDp0ZXN0',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Referer': 'https://www.ratemyprofessors.com/',
};

const PROFILE_QUERY = `
  query TeacherProfileQuery($id: ID!) {
    node(id: $id) {
      ... on Teacher {
        id
        teacherRatingTags {
          tagName
          tagCount
        }
      }
    }
  }
`;

async function fetchTags(rmpId) {
  const res = await fetch(RMP_GRAPHQL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query: PROFILE_QUERY, variables: { id: rmpId } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const tags = data?.data?.node?.teacherRatingTags ?? [];
  return tags
    .sort((a, b) => b.tagCount - a.tagCount)
    .slice(0, 8)
    .map(t => t.tagName);
}

(async () => {
  console.log('=== RMP Tag Fetcher ===\n');

  // Load instructors that have an rmp_id (these are the 65 with RMP ratings)
  const { data: profs, error } = await supabase
    .from('instructors')
    .select('id, name, rmp_id, rmp_tags')
    .not('rmp_id', 'is', null);

  if (error) { console.error('Supabase error:', error.message); process.exit(1); }
  console.log(`Found ${profs.length} instructors with RMP IDs.\n`);

  let updated = 0;
  let failed  = 0;

  for (let i = 0; i < profs.length; i++) {
    const prof = profs[i];
    process.stdout.write(`\r  [${i + 1}/${profs.length}] ${prof.name.padEnd(20)}`);

    try {
      const tags = await fetchTags(prof.rmp_id);

      const { error: upErr } = await supabase
        .from('instructors')
        .update({ rmp_tags: tags, last_updated: new Date().toISOString() })
        .eq('id', prof.id);

      if (upErr) throw upErr;
      updated++;
    } catch (err) {
      failed++;
      // Non-fatal — continue with others
    }

    // 150ms delay between requests to avoid rate-limiting
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\n\nDone. Updated: ${updated}, Failed: ${failed}`);

  // Print a few with tags to confirm it worked
  const { data: sample } = await supabase
    .from('instructors')
    .select('name, rmp_rating, rmp_tags')
    .not('rmp_tags', 'eq', '[]')
    .order('rmp_count', { ascending: false })
    .limit(5);

  if (sample && sample.length > 0) {
    console.log('\nSample results with tags:');
    sample.forEach(p => {
      console.log(`  ${p.name} (${p.rmp_rating}⭐): ${(p.rmp_tags || []).join(', ')}`);
    });
  } else {
    console.log('\nNo tags populated — the individual profile query may not be returning tags.');
    console.log('Ratings and difficulty are still populated and working regardless.');
  }
})();
