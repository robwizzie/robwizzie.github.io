// Gameday: the hero pill (a live score with both logos, or the four teams on an off day) opens the Game center,
// which shows the season, numbers worth a look and every game, and opens any game for its box score,
// full player stats and scoring plays. Past seasons are one click away.
const { test, expect, mockWorld } = require('./mock');

const logo = (abbr) => 'https://a.espncdn.com/i/teamlogos/nba/500/' + abbr.toLowerCase() + '.png';
const team = (abbr, name, short) => ({ id: abbr, abbreviation: abbr, displayName: name, shortDisplayName: short, logo: logo(abbr) });
const now = Date.now();
const daysAgo = (d) => new Date(now - d * 864e5).toISOString();

const live = {
  id: '401', date: new Date(now - 3600e3).toISOString(),
  status: { type: { state: 'in', shortDetail: '8:12 - 3rd' } },
  competitions: [{
    venue: { fullName: 'Xfinity Mobile Arena' }, broadcasts: [{ names: ['NBC Sports Philadelphia'] }],
    competitors: [
      { homeAway: 'home', score: '78', team: team('PHI', 'Philadelphia 76ers', '76ers'), records: [{ type: 'total', summary: '30-18' }],
        linescores: [{ value: 28 }, { value: 30 }, { value: 20 }] },
      { homeAway: 'away', score: '71', team: team('BOS', 'Boston Celtics', 'Celtics'), records: [{ type: 'total', summary: '29-19' }],
        linescores: [{ value: 25 }, { value: 26 }, { value: 20 }] }
    ]
  }]
};
// A finished game, as the schedule lists it (score objects, logos arrays).
const past = (id, days, opp, us, them, home = true) => ({
  id, date: daysAgo(days),
  competitions: [{ status: { type: { state: 'post', completed: true } }, competitors: [
    { homeAway: home ? 'home' : 'away', team: { id: 'PHI', abbreviation: 'PHI', displayName: 'Philadelphia 76ers', shortDisplayName: '76ers', logos: [{ href: logo('PHI') }] }, score: { value: us, displayValue: String(us) }, winner: us > them },
    { homeAway: home ? 'away' : 'home', team: { id: opp, abbreviation: opp, displayName: opp, shortDisplayName: opp, logos: [{ href: logo(opp) }] }, score: { value: them, displayValue: String(them) }, winner: them > us }
  ] }]
});
const schedule = { requestedSeason: { year: 2026, displayName: '2025-26' }, events: [past('1', 6, 'NYK', 110, 104), past('2', 4, 'MIA', 99, 108, false), past('3', 2, 'TOR', 121, 101)] };
const lastSeason = { requestedSeason: { year: 2025 }, events: [past('9', 400, 'ORL', 130, 90), past('8', 380, 'CHI', 95, 100)] };
const playoffs2025 = { events: [past('7', 330, 'NYK', 101, 99)] };

// The summary of the TOR game: header with a linescore, leaders, team stats, every player, scoring and win probability.
const summary = {
  header: { competitions: [{ date: daysAgo(2), status: { type: { state: 'post', completed: true, shortDetail: 'Final' } }, competitors: [
    { homeAway: 'home', score: '121', winner: true, team: { id: 'PHI', abbreviation: 'PHI', displayName: 'Philadelphia 76ers', shortDisplayName: '76ers', logos: [{ href: logo('PHI') }] }, record: [{ type: 'total', summary: '31-18' }], linescores: [{ displayValue: '30' }, { displayValue: '31' }, { displayValue: '30' }, { displayValue: '30' }] },
    { homeAway: 'away', score: '101', team: { id: 'TOR', abbreviation: 'TOR', displayName: 'Toronto Raptors', shortDisplayName: 'Raptors', logos: [{ href: logo('TOR') }] }, record: [{ type: 'total', summary: '20-29' }], linescores: [{ displayValue: '25' }, { displayValue: '26' }, { displayValue: '25' }, { displayValue: '25' }] }
  ] }] },
  leaders: [
    { team: { abbreviation: 'PHI' }, leaders: [{ displayName: 'Points', leaders: [{ displayValue: '34', athlete: { shortName: 'T. Maxey' } }] }] },
    { team: { abbreviation: 'TOR' }, leaders: [{ displayName: 'Points', leaders: [{ displayValue: '22', athlete: { shortName: 'S. Barnes' } }] }] }
  ],
  boxscore: {
    teams: [
      { team: { abbreviation: 'TOR' }, statistics: [{ label: 'Rebounds', displayValue: '38' }, { label: 'Assists', displayValue: '20' }, { label: 'Turnovers', displayValue: '14' }] },
      { team: { abbreviation: 'PHI' }, statistics: [{ label: 'Rebounds', displayValue: '47' }, { label: 'Assists', displayValue: '29' }, { label: 'Turnovers', displayValue: '9' }] }
    ],
    players: [
      { team: { abbreviation: 'TOR', shortDisplayName: 'Raptors', logo: logo('TOR') }, statistics: [{ labels: ['MIN', 'PTS', 'REB', 'AST'], descriptions: ['Minutes', 'Points', 'Rebounds', 'Assists'],
        athletes: [{ starter: true, athlete: { shortName: 'S. Barnes', position: { abbreviation: 'F' } }, stats: ['36', '22', '9', '6'] }], totals: ['240', '101', '38', '20'] }] },
      { team: { abbreviation: 'PHI', shortDisplayName: '76ers', logo: logo('PHI') }, statistics: [{ labels: ['MIN', 'PTS', 'REB', 'AST'], descriptions: ['Minutes', 'Points', 'Rebounds', 'Assists'],
        athletes: [
          { starter: true, athlete: { shortName: 'T. Maxey', position: { abbreviation: 'G' } }, stats: ['38', '34', '4', '9'] },
          { starter: true, athlete: { shortName: 'J. Embiid', position: { abbreviation: 'C' } }, stats: ['33', '29', '12', '5'] },
          { didNotPlay: true, reason: 'DNP-COACH\'S DECISION', athlete: { shortName: 'B. Bench', position: { abbreviation: 'F' } }, stats: [] }
        ], totals: ['240', '121', '47', '29'] }] }
    ]
  },
  scoringPlays: [
    { type: { text: 'Three Point Jumper' }, text: 'Tyrese Maxey makes 26-foot three point jumper', period: { number: 1 }, clock: { displayValue: '11:20' }, team: { id: 'PHI' }, awayScore: 0, homeScore: 3 },
    { type: { text: 'Layup' }, text: 'Scottie Barnes makes layup', period: { number: 2 }, clock: { displayValue: '9:02' }, team: { id: 'TOR' }, awayScore: 2, homeScore: 3 }
  ],
  winprobability: [{ homeWinPercentage: 0.6 }, { homeWinPercentage: 0.55 }, { homeWinPercentage: 0.72 }, { homeWinPercentage: 0.9 }, { homeWinPercentage: 1 }],
  gameInfo: { attendance: 19756 }
};
const teamInfo = { team: { standingSummary: '2nd in Atlantic Division', record: { items: [
  { type: 'total', summary: '30-18', stats: [{ name: 'streak', value: 3 }, { name: 'avgPointsFor', value: 116.2 }, { name: 'avgPointsAgainst', value: 110.4 }] },
  { type: 'home', summary: '17-7' }, { type: 'road', summary: '13-11' }
] } } };

function espn({ liveGame = true } = {}) {
  return (url) => {
    const nba = (p) => url.includes('basketball/nba/' + p);
    if (nba('scoreboard')) return { events: liveGame ? [live] : [] };
    if (nba('summary')) return url.includes('event=3') ? summary : { header: { competitions: [live.competitions[0]] } };
    if (nba('teams/phi/schedule')) {
      if (url.includes('season=2025&seasontype=2')) return lastSeason;
      if (url.includes('season=2025&seasontype=3')) return playoffs2025;
      if (url.includes('seasontype=3')) return { events: [] };
      return schedule;
    }
    if (nba('teams/phi')) return teamInfo;
    return { events: [] };
  };
}

test('a live game shows real logos in the hero and the game center opens on it', async ({ page }) => {
  await mockWorld(page, { espn: espn() }); // later routes win
  await page.goto('/');
  const pill = page.locator('.gd-pill');
  await expect(pill).toHaveClass(/\bin\b/, { timeout: 10000 });
  await expect(pill.locator('img.gd-logo')).toHaveCount(2);
  await expect(pill).toContainText('78');
  await expect(pill).toContainText('8:12 - 3rd');
  expect(await page.evaluate(() => document.documentElement.classList.contains('gameday'))).toBe(true);

  await pill.click();
  const gc = page.getByRole('dialog', { name: 'Game center' });
  await expect(gc).toBeVisible();
  await expect(gc.locator('.gc-tab.on')).toContainText('Sixers');
  await expect(gc.locator('.gc-feature')).toContainText('Live now');
  await expect(gc.locator('.gc-feature .gc-lines thead')).toContainText('Q3');
  await expect(gc.locator('.gc-season')).toContainText('2nd in Atlantic Division');
  await expect(gc.locator('.gc-results .gc-row')).toHaveCount(3);
  await expect(gc.locator('.gc-results .gc-row').first()).toContainText('TOR');
  await expect(gc.locator('.gc-fun')).toContainText('Biggest win');
  await expect(gc.locator('.gc-fun')).toContainText('+20');

  await page.keyboard.press('Escape');
  await expect(gc).toBeHidden();
});

test('on an off day the pill still opens the game center', async ({ page }) => {
  await mockWorld(page, { espn: espn({ liveGame: false }) });
  await page.goto('/');
  const pill = page.locator('.gd-pill');
  await expect(pill).toHaveClass(/idle/);
  await expect(pill.locator('img.gd-team')).toHaveCount(4);
  await expect(pill).toContainText('Game center');
  await pill.click();
  const gc = page.getByRole('dialog', { name: 'Game center' });
  await expect(gc).toBeVisible();
  await expect(gc.locator('.gc-tab')).toHaveCount(4);
  await gc.locator('.gc-tab', { hasText: 'Sixers' }).click();
  await expect(gc.locator('.gc-feature')).toContainText('Last game');
});

test('any game opens to its box score, every player\'s stats and the scoring plays', async ({ page }) => {
  await mockWorld(page, { espn: espn({ liveGame: false }) });
  await page.goto('/');
  await page.locator('.gd-pill').click();
  const gc = page.getByRole('dialog', { name: 'Game center' });
  await gc.locator('.gc-tab', { hasText: 'Sixers' }).click();
  await gc.locator('.gc-results .gc-row', { hasText: 'TOR' }).click();

  // Summary: final linescore, leaders, win probability and every team stat
  await expect(gc.locator('.gc-back')).toBeFocused();
  await expect(gc.locator('.gc-score')).toContainText('101');
  await expect(gc.locator('.gc-lines thead')).toContainText('Q4');
  await expect(gc.locator('.gc-leaders')).toContainText('T. Maxey');
  await expect(gc.locator('.gc-wp')).toBeVisible();
  await expect(gc.locator('.gc-cmp li')).toHaveCount(3);
  await expect(gc.locator('.gc-info')).toContainText('19,756');

  // Player stats: Philly first, a "did not play", team totals, then the other side
  await gc.getByRole('tab', { name: 'Player stats' }).click();
  const box = gc.locator('.gc-bx');
  await expect(box.locator('tbody tr')).toHaveCount(4);
  await expect(box).toContainText('J. Embiid');
  await expect(box.locator('tr.dnp')).toContainText('COACH');
  await expect(box.locator('tr.tot')).toContainText('121');
  await gc.getByRole('tab', { name: 'Raptors' }).click();
  await expect(gc.locator('.gc-bx')).toContainText('S. Barnes');

  // Scoring plays, grouped by quarter
  await gc.getByRole('tab', { name: 'Scoring' }).click();
  await expect(gc.locator('.gc-per')).toHaveCount(2);
  await expect(gc.locator('.gc-play').first()).toContainText('Tyrese Maxey');

  // Esc steps back to the season first, then closes
  await page.keyboard.press('Escape');
  await expect(gc.locator('.gc-results')).toBeVisible();
  await expect(gc.locator('.gc-row[data-id="3"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(gc).toBeHidden();
});

test('past seasons, playoffs included, are one click away', async ({ page }) => {
  await mockWorld(page, { espn: espn({ liveGame: false }) });
  await page.goto('/');
  await page.locator('[data-gamecenter]').click();
  const gc = page.getByRole('dialog', { name: 'Game center' });
  await gc.locator('.gc-tab', { hasText: 'Sixers' }).click();
  const seasons = gc.getByRole('tablist', { name: 'Season' });
  await expect(seasons.getByRole('tab')).toHaveText(['2025–26', '2024–25', '2023–24']);
  await seasons.getByRole('tab', { name: '2024–25' }).click();
  await expect(seasons.getByRole('tab', { name: '2024–25' })).toHaveAttribute('aria-selected', 'true');
  await expect(gc.locator('.gc-results .gc-row')).toHaveCount(3);
  await expect(gc.locator('.gc-results .gc-row').first()).toContainText('Playoffs');
  await expect(gc.locator('.gc-feature')).toHaveCount(0);
  await expect(gc.locator('.gc-fun')).toContainText('Biggest win');
});

test('a team with no data says so instead of breaking', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-gamecenter]').click();
  const gc = page.getByRole('dialog', { name: 'Game center' });
  await gc.locator('.gc-tab', { hasText: 'Flyers' }).click();
  await expect(gc.locator('.gc-tab.on')).toContainText('Flyers');
  await expect(gc.locator('.gc-empty')).toBeVisible();
});
