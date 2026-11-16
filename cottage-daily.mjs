export const companions = {
  pip: { name: 'Pip', kind: 'moss rabbit', coat: '#f5dfb5', accent: '#ad7578', scarf: '#709083' },
  mallow: { name: 'Mallow', kind: 'orchard cat', coat: '#df9a76', accent: '#b76a72', scarf: '#78919b' },
  bramble: { name: 'Bramble', kind: 'fern bear', coat: '#bf9e8d', accent: '#b67d78', scarf: '#a8a66e' },
  clover: { name: 'Clover', kind: 'garden frog', coat: '#a2be87', accent: '#be8a78', scarf: '#bb8297' }
};

const greetings = [
  'There’s a sunny spot by the window with your name on it.',
  'The kettle’s on. What would you like to make time for today?',
  'I opened the curtains for you. The garden looks lovely this morning.',
  'We can take our time. There’s room for one small adventure today.',
  'I saved you a seat by the door. The breeze smells like blossoms.'
];

export const foods = [
  { kind: 'ramen', name: 'Golden miso ramen', detail: 'Warm broth, silky noodles, and a little crunch.' },
  { kind: 'ramen', name: 'Ginger kombu ramen', detail: 'A fragrant bowl with plenty of room for garnishes.' },
  { kind: 'pizza', name: 'Forest mushroom pizza', detail: 'A golden crust with shiitake and sweet basil.' },
  { kind: 'pizza', name: 'Orchard tomato pizza', detail: 'Bright tomatoes, mozzarella, and a hot stone oven.' },
  { kind: 'ice', name: 'Petal sundae', detail: 'Sakura strawberry, honey vanilla, and petal sprinkles.' },
  { kind: 'ice', name: 'Moonberry cone', detail: 'A waffle cone with a scoop of moonberry.' }
];

export function localDay(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(part => String(part).padStart(2, '0')).join('-');
}

function randomFor(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return () => {
    hash = (hash + 0x6D2B79F5) | 0;
    let mixed = Math.imul(hash ^ hash >>> 15, 1 | hash);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, 61 | mixed);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

export function dailyContent(seed, date) {
  const day = localDay(date);
  const random = randomFor(seed + '/' + day);
  const pick = list => list[Math.floor(random() * list.length)];
  const ids = Object.keys(companions);
  const companion = pick(ids);
  const greeting = pick(greetings);
  const food = pick(foods);
  const visitor = pick(ids.filter(id => id !== companion));
  const mayVisit = random() < 0.65;
  const minute = 8 * 60 + Math.floor(random() * 10 * 60);
  return { day, companion, greeting, food, visitor: mayVisit ? visitor : null, minute };
}

export function visitDue(daily, date, { enabled, idle, seen }) {
  return Boolean(enabled && idle && !seen && daily.visitor &&
    date.getHours() * 60 + date.getMinutes() >= daily.minute);
}
