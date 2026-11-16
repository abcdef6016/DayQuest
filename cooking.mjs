export const broths = {
  miso: { name: 'Golden miso', color: '#df9e56' },
  shoyu: { name: 'Forest shoyu', color: '#ad6249' },
  kombu: { name: 'Ginger kombu', color: '#efc77a' }
};

export const ingredients = {
  egg: { name: 'Jammy egg', art: '<ellipse rx="15" ry="10" fill="#fff8df"/><circle r="6" fill="#f2a748"/>' },
  nori: { name: 'Nori', art: '<path d="M-12-12L12-10 10 13-13 10Z" fill="#3e674e"/><path d="m-8-7 14 13m-12-2 5 5" stroke="#769773"/>' },
  mushroom: { name: 'Shiitake', art: '<path d="M-4 1h8v12h-8z" fill="#f4d3a0"/><path d="M-15 3a15 12 0 0 1 30 0Z" fill="#9c5b48"/><path d="m-6-2 11-3m-7-2 5 7" stroke="#ffdbac"/>' },
  scallion: { name: 'Scallions', garnish: true, art: '<g fill="none" stroke="#507f55" stroke-width="3"><ellipse cx="-8" cy="-3" rx="4" ry="3"/><ellipse cx="6" cy="4" rx="4" ry="3"/><ellipse cx="1" cy="-7" rx="3" ry="2"/></g>' },
  sesame: { name: 'Sesame', garnish: true, art: '<g fill="#fff2ce"><ellipse cx="-8" cy="-2" rx="2" ry="4"/><ellipse cx="0" cy="5" rx="2" ry="4"/><ellipse cx="8" cy="-5" rx="2" ry="4"/></g>' }
};

export const stirSteps = 8;
export const freshDish = () => ({ stage: 'choose', broth: null, stir: 0, placements: [] });

export function inBowl({ x, y }) {
  return Number.isFinite(x) && Number.isFinite(y) && ((x - 325) / 103) ** 2 + ((y - 224) / 36) ** 2 <= 1;
}

export function cook(dish, action, value) {
  switch (action) {
    case 'choose':
      if (['choose', 'pour'].includes(dish.stage) && Object.hasOwn(broths, value) && value !== dish.broth)
        return { ...dish, broth: value, stage: 'pour' };
      break;
    case 'pour':
      if (dish.stage === 'pour') return { ...dish, stage: 'heat' };
      break;
    case 'heat':
      if (dish.stage === 'heat') return { ...dish, stage: 'noodles' };
      break;
    case 'noodles':
      if (dish.stage === 'noodles') return { ...dish, stage: 'stir' };
      break;
    case 'stir':
      if (dish.stage === 'stir') {
        const stir = Math.min(stirSteps, dish.stir + 1);
        return { ...dish, stir, stage: stir === stirSteps ? 'transfer' : 'stir' };
      }
      break;
    case 'transfer':
      if (dish.stage === 'transfer') return { ...dish, stage: 'toppings' };
      break;
    case 'place': {
      if (!value || !Object.hasOwn(ingredients, value.id) || !inBowl(value) || dish.placements.length >= 24) break;
      const { garnish } = ingredients[value.id];
      if (dish.stage !== 'toppings' || (garnish && !dish.placements.some(item => !ingredients[item.id].garnish))) break;
      const { id, x, y } = value;
      return { ...dish, placements: [...dish.placements, { id, x, y }] };
    }
    case 'serve':
      if (dish.stage === 'toppings' && dish.placements.some(item => ingredients[item.id].garnish))
        return { ...dish, stage: 'served' };
      break;
  }
  return dish;
}

export function openCookingStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('DayQuestCooking', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('ramen');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Cooking storage is open in another window.'));
    request.onsuccess = () => resolve(request.result);
  });
}

// Dish, undo history and scrapbook changes commit together.
export function cookingRecord(db, update, key = 'kitchen', createDish = freshDish) {
  return new Promise((resolve, reject) => {
    let updateError;
    const transaction = db.transaction('ramen', update ? 'readwrite' : 'readonly');
    const store = transaction.objectStore('ramen');
    const request = store.get(key);
    let record;
    request.onsuccess = () => {
      record = request.result ?? { dish: createDish(), history: [], recipes: [], name: '' };
      if (update) {
        try {
          record = update(record);
          store.put(record, key);
        } catch (error) {
          updateError = error;
          transaction.abort();
        }
      }
    };
    transaction.oncomplete = () => resolve(record);
    transaction.onabort = () => reject(updateError ?? transaction.error ?? new Error('Cooking save interrupted.'));
  });
}

