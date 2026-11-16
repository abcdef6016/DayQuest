import { cookingRecord, openCookingStore, freshDish, broths, ingredients, inBowl, stirSteps } from './cooking.mjs';
import { freshPizza, freshIce, flavors, pizzaArea, pizzaToppings, icePlacement, iceToppings } from './village-recipes.mjs';
import { companions } from './cottage-daily.mjs';

const format = 'dayquest-save-crystal';
export const kitchens = { kitchen: freshDish, pizza: freshPizza, ice: freshIce };
const stages = {
  kitchen: ['choose', 'pour', 'heat', 'noodles', 'stir', 'transfer', 'toppings', 'served'],
  pizza: ['roll', 'sauce', 'top', 'bake', 'slice', 'serve', 'served'],
  ice: ['vessel', 'scoop', 'top', 'served']
};
const catalogs = { kitchen: ingredients, pizza: pizzaToppings, ice: iceToppings };
const object = data => Boolean(data && typeof data === 'object' && !Array.isArray(data));
const int = (data, min, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(data) && data >= min && data <= max;
const text = data => typeof data === 'string';
const keys = Object.keys(kitchens);
const validDay = data => text(data) && /^\d{4}-\d{2}-\d{2}$/.test(data);

function requireData(condition, label) {
  if (!condition) throw new Error('Invalid ' + label + ' in the Save Crystal.');
}

function validateDish(kind, dish) {
  const area = { kitchen: inBowl, pizza: pizzaArea, ice: point => icePlacement(point, dish) }[kind];
  const validPlacement = entry => object(entry) && Object.hasOwn(catalogs[kind], entry.id) && area(entry);
  requireData(object(dish) && stages[kind].includes(dish.stage) && Array.isArray(dish.placements), 'cooking progress');
  const { stage } = dish;
  if (kind === 'kitchen') {
    requireData(int(dish.stir, 0, stirSteps) && (stage === 'choose' ? dish.broth === null : Object.hasOwn(broths, dish.broth)), 'ramen');
  } else if (kind === 'pizza') {
    requireData(int(dish.rolls, 0, 4) && int(dish.readyAt, stage === 'bake' ? 1 : 0), 'pizza');
  } else {
    requireData((stage === 'vessel' ? dish.vessel === null : ['cone','cup'].includes(dish.vessel)) &&
      (dish.flavor === null || Object.hasOwn(flavors, dish.flavor)) && Array.isArray(dish.scoops) &&
      dish.scoops.length <= 3 && dish.scoops.every(id => Object.hasOwn(flavors, id)), 'ice cream');
  }
  const limit = { kitchen: 24, pizza: 16, ice: 12 }[kind];
  requireData(dish.placements.length <= limit && dish.placements.every(validPlacement), 'ingredient placement');
  return dish;
}

function validateKitchen(kind, record) {
  requireData(object(record) && Array.isArray(record.recipes) && Array.isArray(record.history) &&
    record.history.length <= 80 && text(record.name), 'kitchen record');
  validateDish(kind, record.dish);
  for (const snapshot of record.history) validateDish(kind, snapshot);
  for (const recipe of record.recipes) {
    requireData(object(recipe) && text(recipe.id) && text(recipe.name) && recipe.name.trim() && recipe.dish?.stage === 'served', 'recipe');
    validateDish(kind, recipe.dish);
  }
  return record;
}

const validators = {
  coins: data => int(data, 0),
  xp: data => int(data, 0),
  level: data => int(data, 1),
  botColor: data => text(data) && /^#[0-9a-f]{6}$/i.test(data),
  sfxEnabled: data => typeof data === 'boolean',
  activeEnergy: data => ['low','medium','high'].includes(data),
  activeSpace: text,
  returnPortal: data => data === null || (object(data) && [data.title, data.context, data.nextStep].every(text)),
  quests: data => Array.isArray(data) && data.every(item => object(item) && int(item.id, 0) &&
    [item.title,item.space,item.tier].every(text) && typeof item.done === 'boolean'),
  parkingLot: data => Array.isArray(data) && data.every(item => object(item) && int(item.id, 0) && text(item.text)),
  rewards: data => Array.isArray(data) && data.every(item => object(item) && int(item.id, 0) && int(item.cost, 1) && text(item.title)),
  notebookNotes: data => Array.isArray(data) && data.every(item => object(item) && [item.id,item.title,item.body].every(text) &&
    int(item.created, 0, 8640000000000000) && int(item.updated, 0, 8640000000000000))
};

function productivityData(source) {
  requireData(object(source), 'productivity data');
  const entries = Object.entries(validators).filter(([key]) => Object.hasOwn(source, key));
  for (const [key, validate] of entries) requireData(validate(source[key]), key);
  requireData(entries.length, 'productivity data');
  return Object.fromEntries(entries.map(([key]) => [key, source[key]]));
}

function cottageData(source) {
  requireData(object(source) && text(source.seed) && source.seed && typeof source.visits === 'boolean' &&
    (source.visit === null || (object(source.visit) && validDay(source.visit.day) &&
      Object.hasOwn(companions, source.visit.id) && typeof source.visit.dismissed === 'boolean')) &&
    Array.isArray(source.seen) && source.seen.every(id => Object.hasOwn(companions, id)), 'Cottage settings');
  return source;
}

export function createCrystal(productivity, cooking, cottage) {
  const snapshot = productivityData(productivity);
  return cooking ? { format, version: 2, productivity: snapshot, cooking, cottage } : snapshot;
}

export function readCrystal(input) {
  requireData(object(input), 'file');
  if (!Object.hasOwn(input, 'format')) return { productivity: productivityData(input) };
  requireData(input.format === format && input.version === 2, 'version');
  const productivity = productivityData(input.productivity);
  requireData(object(input.cooking), 'cooking data');
  const cooking = Object.fromEntries(keys.map(key => [key, validateKitchen(key, input.cooking[key])]));
  return { productivity, cooking, cottage: cottageData(input.cottage) };
}

export async function readKitchens() {
  const db = await openCookingStore();
  try {
    return Object.fromEntries(await Promise.all(keys.map(async key =>
      [key, await cookingRecord(db, undefined, key, kitchens[key])])));
  } finally {
    db.close();
  }
}

function combineRecords(current, incoming, fresh) {
  const draft = JSON.stringify(current.dish);
  const hasDraft = current.dish.stage === 'served'
    ? !current.recipes.some(recipe => JSON.stringify(recipe.dish) === draft)
    : current.history.length > 0 || draft !== JSON.stringify(fresh());
  const recipes = [...current.recipes];
  const ids = new Set(recipes.map(recipe => recipe.id));
  for (const recipe of incoming.recipes) {
    if (!ids.has(recipe.id)) {
      recipes.push(recipe);
      ids.add(recipe.id);
    }
  }
  const keepCurrent = hasDraft && JSON.stringify(current.dish) !== JSON.stringify(incoming.dish);
  return { record: { ...(keepCurrent ? current : incoming), recipes }, keepCurrent };
}

// One transaction commits the three kitchen records together.
export async function restoreKitchens(incoming) {
  const db = await openCookingStore();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('ramen', 'readwrite');
      const store = transaction.objectStore('ramen');
      let kept = 0;
      for (const key of keys) {
        const request = store.get(key);
        request.onsuccess = () => {
          const current = request.result ?? { dish: kitchens[key](), history: [], name: '', recipes: [] };
          const { record, keepCurrent } = combineRecords(current, incoming[key], kitchens[key]);
          kept += Number(keepCurrent);
          store.put(record, key);
        };
      }
      transaction.oncomplete = () => resolve(kept);
      transaction.onabort = () => reject(transaction.error ?? new Error('Kitchen restore was interrupted.'));
    });
  } finally {
    db.close();
  }
}
