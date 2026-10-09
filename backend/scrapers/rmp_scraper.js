// scrapers/rmp_scraper.js
//
// Fetches all Virginia Tech professors from Rate My Professors using
// their unofficial GraphQL API, then saves the results to:
//   data/raw/rmp_vt_professors.json
//
// Run from the backend/ directory:
//   node scrapers/rmp_scraper.js
//
// Requirements: node 18+ (uses built-in fetch). No npm install needed.

const fs   = require('fs');
const path = require('path');

const RMP_GRAPHQL = 'https://www.ratemyprofessors.com/graphql';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Basic dGVzdDp0ZXN0',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.ratemyprofessors.com/',
};

const OUT_FILE = path.join(__dirname, '../data/raw/rmp_vt_professors.json');

// ── Step 1: Find VT's school ID ────────────────────────────────────────────
async function findSchoolId(schoolName) {
  const query = `
    query SchoolSearchQuery($query: SchoolSearchQuery!) {
      newSearch {
        schools(query: $query, first: 10) {
          edges {
            node {
              id
              name
              city
              state
            }
          }
        }
      }
    }
  `;

  const res = await fetch(RMP_GRAPHQL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query, variables: { query: { text: schoolName } } }),
  });

  if (!res.ok) throw new Error(`School search HTTP ${res.status}`);
  const data = await res.json();
  const schools = data?.data?.newSearch?.schools?.edges ?? [];

  // Find the exact Virginia Tech match
  const vt = schools.find(e =>
    e.node.name.toLowerCase().includes('virginia tech') ||
    e.node.name.toLowerCase().includes('virginia polytechnic')
  );

  if (!vt) {
    console.log('Available schools:', schools.map(e => `${e.node.name} (${e.node.city}, ${e.node.state})`));
    throw new Error('Virginia Tech not found in school search results');
  }

  console.log(`Found: ${vt.node.name} (${vt.node.city}, ${vt.node.state}) — ID: ${vt.node.id}`);
  return vt.node.id;
}

// ── Step 2: Page through all professors at VT ─────────────────────────────
const TEACHER_QUERY = `
  query TeacherSearchPaginationQuery(
    $count: Int!
    $cursor: String
    $query: TeacherSearchQuery!
  ) {
    search: newSearch {
      teachers(query: $query, first: $count, after: $cursor) {
        edges {
          cursor
          node {
            id
            firstName
            lastName
            avgRating
            avgDifficulty
            wouldTakeAgainPercent
            numRatings
            department
            teacherRatingTags {
              tagName
              tagCount
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

async function fetchAllProfessors(schoolId) {
  const professors = [];
  let cursor = null;
  let page = 1;
  const PAGE_SIZE = 20;

  while (true) {
    console.log(`  Fetching page ${page} (${professors.length} professors so far)...`);

    const variables = {
      count: PAGE_SIZE,
      cursor,
      query: { text: '', schoolID: schoolId },
    };

    const res = await fetch(RMP_GRAPHQL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ query: TEACHER_QUERY, variables }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Teacher search HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const teachers = data?.data?.search?.teachers;

    if (!teachers) {
      console.error('Unexpected response shape:', JSON.stringify(data).slice(0, 400));
      break;
    }

    for (const edge of teachers.edges) {
      const n = edge.node;
      professors.push({
        rmp_id:               n.id,
        first_name:           n.firstName,
        last_name:            n.lastName,
        avg_rating:           n.avgRating,
        avg_difficulty:       n.avgDifficulty,
        would_take_again_pct: n.wouldTakeAgainPercent,
        num_ratings:          n.numRatings,
        department:           n.department,
        tags:                 (n.teacherRatingTags ?? [])
                                .sort((a, b) => b.tagCount - a.tagCount)
                                .slice(0, 8)
                                .map(t => t.tagName),
      });
    }

    const { hasNextPage, endCursor } = teachers.pageInfo;
    if (!hasNextPage) break;

    cursor = endCursor;
    page++;

    // Polite delay between pages (100ms) to avoid rate-limiting
    await new Promise(r => setTimeout(r, 100));
  }

  return professors;
}

// ── Main ──────────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log('=== RMP Scraper for Virginia Tech ===\n');

    console.log('Step 1: Finding Virginia Tech school ID...');
    const schoolId = await findSchoolId('Virginia Tech');

    console.log('\nStep 2: Fetching all professors...');
    const professors = await fetchAllProfessors(schoolId);

    console.log(`\nFetched ${professors.length} professors total.`);

    // Ensure output directory exists
    const dir = path.dirname(OUT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(OUT_FILE, JSON.stringify(professors, null, 2));
    console.log(`\nSaved to: ${OUT_FILE}`);
    console.log('\nNext step: run  node scripts/rebuild_instructors.js');

  } catch (err) {
    console.error('\nERROR:', err.message);
    process.exit(1);
  }
})();
