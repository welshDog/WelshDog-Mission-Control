// Copied verbatim from welshdog-designs-web3-shop@src/lib/seasonalEvents.js
// so AdminCalendar's data shape stays identical across both apps.

export const getEasterDate = (year) => {
  const f = Math.floor,
    G = year % 19,
    C = f(year / 100),
    H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30,
    I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11)),
    J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7,
    L = I - J,
    month = 3 + f((L + 40) / 44),
    day = L + 28 - 31 * f(month / 4);

  return new Date(year, month - 1, day);
};

export const getBlackFriday = (year) => {
  const novemberFirst = new Date(year, 10, 1);
  const dayOfWeek = novemberFirst.getDay(); // 0 = Sunday, 5 = Friday
  const firstFriday = dayOfWeek <= 5 ? 6 - dayOfWeek : 13 - dayOfWeek;
  // Black Friday is the 4th Friday
  return new Date(year, 10, firstFriday + 21);
};

export const getSeasonalEvents = (year) => {
  const fixedEvents = [
    { name: "New Year's Day", month: 0, day: 1, type: 'holiday' },
    { name: "Valentine's Day", month: 1, day: 14, type: 'seasonal' },
    { name: "St. David's Day 🏴󠁧󠁢󠁷󠁬󠁳󠁿", month: 2, day: 1, type: 'cultural' }, // Welsh special!
    { name: "Halloween", month: 9, day: 31, type: 'seasonal' },
    { name: "Christmas Eve", month: 11, day: 24, type: 'holiday' },
    { name: "Christmas Day", month: 11, day: 25, type: 'holiday' },
    { name: "Boxing Day", month: 11, day: 26, type: 'holiday' },
    { name: "New Year's Eve", month: 11, day: 31, type: 'holiday' },
  ];

  const events = fixedEvents.map(e => ({
    ...e,
    date: new Date(year, e.month, e.day)
  }));

  // Dynamic Events
  const easter = getEasterDate(year);
  events.push({
    name: "Easter Sunday",
    date: easter,
    type: 'holiday'
  });

  const blackFriday = getBlackFriday(year);
  events.push({
    name: "Black Friday ⚫",
    date: blackFriday,
    type: 'shopping'
  });

  const cyberMonday = new Date(blackFriday);
  cyberMonday.setDate(blackFriday.getDate() + 3);
  events.push({
    name: "Cyber Monday 💻",
    date: cyberMonday,
    type: 'shopping'
  });

  return events.sort((a, b) => a.date - b.date);
};
