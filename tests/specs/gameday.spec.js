// Gameday: a live Sixers game shows up in the hero with both logos, and the Game center
// lays out the box score, leaders, team stats, the season record and recent results.
const { test, expect, mockWorld } = require('./mock');

const logo = (abbr) => 'https://a.espncdn.com/i/teamlogos/nba/500/' + abbr.toLowerCase() + '.png';
const team = (abbr, name, short) => ({ abbreviation: abbr, displayName: name, shortDisplayName: short, logo: logo(abbr) });
const now = Date.now();

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
const summary = {
  leaders: [
    { team: { abbreviation: 'PHI' }, leaders: [{ displayName: 'Points', leaders: [{ displayValue: '24', athlete: { shortName: 'T. Maxey' } }] }] },
    { team: { abbreviation: 'BOS' }, leaders: [{ displayName: 'Points', leaders: [{ displayValue: '19', athlete: { shortName: 'J. Tatum' } }] }] }
  ],
  boxscore: { teams: [
    { team: { abbreviation: 'BOS' }, statistics: [{ label: 'Rebounds', displayValue: '30' }, { label: 'Assists', displayValue: '15' }] },
    { team: { abbreviation: 'PHI' }, statistics: [{ label: 'Rebounds', displayValue: '34' }, { label: 'Assists', displayValue: '19' }] }
  ] }
};
const teamInfo = { team: { standingSummary: '2nd in Atlantic Division', record: { items: [
  { type: 'total', summary: '30-18', stats: [{ name: 'streak', value: 3 }, { name: 'avgPointsFor', value: 116.2 }, { name: 'avgPointsAgainst', value: 110.4 }] },
  { type: 'home', summary: '17-7' }, { type: 'road', summary: '13-11' }
] } } };
const past = (id, days, opp, us, them) => ({
  id, date: new Date(now - days * 864e5).toISOString(),
  competitions: [{ status: { type: { state: 'post', completed: true } }, competitors: [
    { homeAway: 'home', team: { abbreviation: 'PHI', displayName: 'Philadelphia 76ers', logos: [{ href: logo('PHI') }] }, score: { value: us, displayValue: String(us) }, winner: us > them },
    { homeAway: 'away', team: { abbreviation: opp, displayName: opp, shortDisplayName: opp, logos: [{ href: logo(opp) }] }, score: { value: them, displayValue: String(them) }, winner: them > us }
  ] }]
});
const schedule = { events: [past('1', 6, 'NYK', 110, 104), past('2', 4, 'MIA', 99, 108), past('3', 2, 'TOR', 121, 101)] };

function espn(url) {
  if (url.includes('basketball/nba/scoreboard')) return { events: [live] };
  if (url.includes('basketball/nba/summary')) return summary;
  if (url.includes('basketball/nba/teams/phi/schedule')) return schedule;
  if (url.includes('basketball/nba/teams/phi')) return teamInfo;
  return { events: [] };
}

test('a live game shows real logos in the hero and opens the game center', async ({ page }) => {
  await mockWorld(page, { espn }); // later routes win
  await page.goto('/');
  const pill = page.locator('.gd-pill');
  await expect(pill).toBeVisible({ timeout: 10000 });
  await expect(pill).toHaveClass(/\bin\b/);
  await expect(pill.locator('img.gd-logo')).toHaveCount(2);
  await expect(pill).toContainText('78');
  await expect(pill).toContainText('8:12 - 3rd');
  expect(await page.evaluate(() => document.documentElement.classList.contains('gameday'))).toBe(true);

  await pill.click();
  const gc = page.getByRole('dialog', { name: 'Game center' });
  await expect(gc).toBeVisible();
  await expect(gc.locator('.gc-tab.on')).toContainText('Sixers');
  await expect(gc.locator('.gc-match')).toContainText('Celtics');
  await expect(gc.locator('.gc-lines tbody tr')).toHaveCount(2);
  await expect(gc.locator('.gc-lines thead')).toContainText('Q3');
  await expect(gc.locator('.gc-leaders')).toContainText('T. Maxey');
  await expect(gc.locator('.gc-cmp')).toContainText('Rebounds');
  await expect(gc.locator('.gc-season')).toContainText('30-18');
  await expect(gc.locator('.gc-season')).toContainText('2nd in Atlantic Division');
  await expect(gc.locator('.gc-recent li')).toHaveCount(3);
  await expect(gc.locator('.gc-recent li').first()).toContainText('TOR');
  await expect(gc.locator('.gc-recent .gc-wl.l')).toHaveCount(1);

  // Other teams: no game today is fine, the tab still says so instead of breaking.
  await gc.locator('.gc-tab', { hasText: 'Flyers' }).click();
  await expect(gc.locator('.gc-tab.on')).toContainText('Flyers');
  await expect(gc.locator('.gc-empty')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(gc).toBeHidden();
});

test('the game center is reachable from the About section on any day', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-gamecenter]').click();
  const gc = page.getByRole('dialog', { name: 'Game center' });
  await expect(gc).toBeVisible();
  await expect(gc.locator('.gc-tab')).toHaveCount(4);
  await expect(page.locator('.gd-pill')).toHaveCount(0);
});
