import { cookingRecord, openCookingStore } from './cooking.mjs';
import { bindCookingButtons, svgPoint } from './cooking-input.mjs';
import { openVillageScrapbook, showRamenKitchen } from './ramen.mjs';
import { pizzaArea, iceArea, icePlacement, scoopCenter, freshPizza, freshIce, pizzaAction, iceAction, pizzaToppings, iceToppings, flavors } from './village-recipes.mjs';
import { villageScene, pizzaProps, scoopArt, pizzaRollLabel } from './village-art.mjs';

const root = document.querySelector('#tab-ramen');
const nav = document.querySelector('#village-nav');
const shop = document.querySelector('#village-shop');
const ramen = document.querySelector('#ramen-bar');
nav.innerHTML = `
  <button type="button" data-shop="ramen">Ramen</button>
  <button type="button" data-shop="pizza">Pizza</button>
  <button type="button" data-shop="ice">Ice Cream</button>
  <button type="button" data-shop="scrapbook">Scrapbook</button>`;
shop.innerHTML = `
  <div class="ramen-frame">
    <header class="ramen-heading"><div><p>Food Village</p><h2 id="village-title"></h2></div></header>
    <svg id="village-scene" viewBox="0 0 480 300" role="img"></svg>
    <div class="ramen-controls">
      <p id="village-instructions" aria-live="polite">Opening the kitchen…</p>
      <p id="village-clock" hidden></p>
      <div class="ramen-options" id="village-options"></div>
      <label for="village-position" id="village-placement" hidden>Placement
        <select id="village-position">
          <option value="0">Center</option><option value="1">Left</option><option value="2">Right</option>
          <option value="3">Back</option><option value="4">Front</option>
        </select>
      </label>
      <form id="village-save" hidden>
        <label for="village-name">Name your creation</label>
        <input id="village-name" required maxlength="64">
        <button type="submit">Save recipe</button>
      </form>
      <footer class="ramen-footer">
        <button type="button" id="village-undo">Undo</button>
        <button type="button" id="village-reset">Reset counter</button>
        <button type="button" id="village-replay" hidden>Cook again</button>
      </footer>
      <p id="village-status" role="status"></p>
    </div>
  </div>`;

const find = id => document.querySelector('#village-' + id);
const scene = find('scene');
const shops = {
  pizza: {
    title: 'Ember Grove Pizza Bar', fresh: freshPizza, action: pizzaAction, toppings: pizzaToppings, area: pizzaArea,
    positions: [[247,191],[192,191],[302,191],[247,160],[247,222]]
  },
  ice: {
    title: 'Petal & Frost Ice Cream', fresh: freshIce, action: iceAction, toppings: iceToppings, area: icePlacement
  }
};
let active = 'ramen';
let origin = 'ramen';
let records = {};
let db;
let queue = Promise.resolve();
let surface;
let bakeTimer;
let effectTimer;

function setActiveButton(kind) {
  for (const button of nav.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.shop === kind));
  }
}

function select(kind, recipeId) {
  if (isDragging()) return;
  if (kind === 'scrapbook') {
    if (active !== 'scrapbook') origin = active;
    openVillageScrapbook(origin === 'ramen' ? undefined : origin, recipeId);
  } else if (kind === 'ramen') showRamenKitchen();
  active = kind;
  ramen.hidden = Boolean(shops[kind]);
  shop.hidden = !shops[kind];
  setActiveButton(kind);
  surface = undefined;
  find('status').textContent = '';
  find('position').selectedIndex = 0;
  render();
}

nav.addEventListener('click', event => {
  const button = event.target.closest('button[data-shop]');
  if (button) select(button.dataset.shop);
});
bindCookingButtons(nav, {});

root.addEventListener('dayquest:scrapbook', event => {
  if (event.detail) setActiveButton('scrapbook');
});
root.addEventListener('dayquest:shop', event => {
  const { kind, recipe } = event.detail;
  select(kind);
  if (recipe) restart(kind, recipe);
});

function write(kind, transform, after) {
  if (!db) return;
  queue = queue.then(async () => {
    const previous = records[kind];
    const current = await cookingRecord(db, transform, kind, shops[kind].fresh);
    records[kind] = current;
    if (active === kind) render();
    after?.(current, previous);
  }).catch(() => {
    if (active === kind) find('status').textContent = 'That action could not be saved. Try again.';
  });
}

function perform(action, value) {
  const kind = active;
  let changed = false;
  write(kind, record => {
    const dish = shops[kind].action(record.dish, action, value);
    if (dish === record.dish) return record;
    changed = true;
    return { ...record, dish, history: [...record.history, record.dish].slice(-80) };
  }, () => {
    if (!changed || active !== kind) return;
    find('status').textContent = '';
    animate(action, value);
  });
}

function animate(action, value) {
  const effect = scene.querySelector('.village-effect');
  let point;
  let art;
  if (action === 'roll') { point = { x: 247, y: 185 }; art = pizzaProps.pin; }
  if (action === 'sauce') { point = { x: 247, y: 190 }; art = pizzaProps.sauce; }
  if (action === 'slice') { point = { x: 247, y: 191 }; art = pizzaProps.cutter; }
  if (action === 'place') { point = value; art = shops[active].toppings[value.id][1]; }
  if (action === 'scoop') {
    const [x, y] = scoopCenter(records.ice.dish.scoops.length - 1);
    point = { x, y };
    art = scoopArt(flavors[records.ice.dish.flavor][1]);
  }
  if (!point) return;
  effect.innerHTML = '<g transform="translate(' + point.x + ' ' + point.y + ')"><g class="village-drop">' + art + '</g></g>';
  clearTimeout(effectTimer);
  effectTimer = setTimeout(() => { if (!surface && !isDragging()) effect.replaceChildren(); }, 460);
}

function add(label, action, { value, target, icon, disabled = false, pressed } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = action;
  if (value) button.dataset.value = value;
  if (target) button.dataset.target = target;
  if (icon) button.innerHTML = '<svg viewBox="-19 -19 38 38" aria-hidden="true">' + icon + '</svg>';
  if (pressed !== undefined) button.setAttribute('aria-pressed', pressed);
  button.append(label);
  button.disabled = disabled;
  find('options').append(button);
}

function pizzaControls(dish) {
  switch (dish.stage) {
    case 'roll':
      add('Roll dough', 'roll');
      return pizzaRollLabel(dish.rolls) + '. Swipe across the dough or tap Roll dough.';
    case 'sauce':
      add('Add tomato sauce', 'sauce', { target: 'food' });
      return 'Drag the sauce onto the dough, or tap Add tomato sauce.';
    case 'top':
      for (const [id, [name, art]] of Object.entries(pizzaToppings)) {
        const needsCheese = !dish.placements.some(item => item.id === 'cheese');
        add(name, 'place', { value: id, target: 'food', icon: art,
          disabled: dish.placements.length >= (needsCheese && id !== 'cheese' ? 15 : 16) });
      }
      add('Bake pizza', 'bake', { disabled: !dish.placements.some(item => item.id === 'cheese') });
      return 'Place mozzarella and your favorite toppings, then bake.';
    case 'bake':
      add('Take out pizza', 'out', { disabled: Date.now() < dish.readyAt });
      return 'Your pizza is in the oven.';
    case 'slice':
      add('Slice pizza', 'slice');
      return 'Swipe across the pizza to slice it, or tap Slice pizza.';
    case 'serve':
      add('Serve to Rowan', 'serve');
      return 'Serve your pizza while it’s warm.';
    default:
      return 'Rowan loved your pizza! Give it a name to save it.';
  }
}

function iceControls(dish) {
  switch (dish.stage) {
    case 'vessel':
      add('Waffle cone', 'vessel', { value: 'cone' });
      add('Sundae cup', 'vessel', { value: 'cup' });
      return 'Choose a waffle cone or a sundae cup.';
    case 'scoop':
      for (const [id, [name, color]] of Object.entries(flavors)) {
        add(name, 'flavor', { value: id, pressed: dish.flavor === id,
          icon: '<circle r="10" fill="' + color + '" stroke="#976c75" stroke-width="2"/>' });
      }
      add('Add scoop', 'scoop', { disabled: !dish.flavor });
      add('Finish scooping', 'finish', { disabled: !dish.scoops.length });
      return dish.flavor
        ? 'Start in the tub, drag down to scoop, then lift into the serving dish. You can stack up to three scoops.'
        : 'Choose a flavor to fill the ice cream tub.';
    case 'top':
      for (const [id, [name, art]] of Object.entries(iceToppings))
        add(name, 'place', { value: id, target: 'food', icon: art, disabled: dish.placements.length >= 12 });
      add('Serve to Rowan', 'serve', { disabled: !dish.placements.length });
      return 'Drag a topping onto the ice cream, or choose a position and tap a topping.';
    default:
      return 'Rowan loved your ice cream! Give it a name to save it.';
  }
}

function clock(dish) {
  const timer = find('clock');
  const seconds = Math.max(0, Math.ceil((dish.readyAt - Date.now()) / 1000));
  timer.textContent = seconds ? 'Baking · ' + seconds + ' s' : 'Golden crust. Ready to take out!';
  find('options').querySelector('[data-action=out]').disabled = seconds > 0;
  if (seconds) bakeTimer = setTimeout(() => clock(dish), 250);
}

function render() {
  clearTimeout(bakeTimer);
  const config = shops[active];
  const record = records[active];
  if (!config) return;
  find('title').textContent = config.title;
  scene.setAttribute('aria-label', config.title + ' cooking scene');
  if (!record) {
    find('instructions').textContent = 'Opening the kitchen…';
    return;
  }
  const { dish, history, name } = record;
  const { stage } = dish;
  const focus = document.activeElement?.dataset;
  scene.dataset.gesture = active === 'pizza' && ['roll','slice'].includes(stage) ? stage
    : active === 'ice' && stage === 'scoop' && dish.flavor ? 'scoop' : '';
  scene.innerHTML = villageScene(active, dish) + '<g class="village-effect" pointer-events="none"></g>';
  const options = find('options');
  options.replaceChildren();
  find('instructions').textContent = (active === 'pizza' ? pizzaControls : iceControls)(dish);
  find('placement').hidden = stage !== 'top';
  find('clock').hidden = stage !== 'bake';
  if (stage === 'bake') clock(dish);
  find('undo').disabled = !history.length;
  find('reset').disabled = !history.length && stage === config.fresh().stage;
  find('save').hidden = stage !== 'served';
  find('replay').hidden = stage !== 'served';
  if (document.activeElement !== find('name')) find('name').value = name;
  if (focus?.action) {
    const buttons = [...options.querySelectorAll('button:not(:disabled)')];
    const equivalent = buttons.find(button => button.dataset.action === focus.action && button.dataset.value === focus.value);
    (equivalent ?? buttons[0] ?? (stage === 'served' ? find('name') : find('undo'))).focus();
  }
}

function startGesture(event) {
  if (!scene.dataset.gesture || event.button !== 0 || surface || isDragging()) return;
  const point = svgPoint(scene, event);
  const action = scene.dataset.gesture;
  if (action === 'scoop') {
    if (Math.hypot((point.x - 129) / 78, (point.y - 181) / 34) > 1) return;
  } else if (!pizzaArea(point)) return;
  surface = { id: event.pointerId, action, start: point, dipped: false };
  scene.setPointerCapture(event.pointerId);
}
scene.addEventListener('pointerdown', startGesture);

scene.addEventListener('pointermove', event => {
  if (surface?.id !== event.pointerId) return;
  const point = svgPoint(scene, event);
  let art;
  if (surface.action === 'scoop') {
    if (point.x > 54 && point.x < 201 && point.y > surface.start.y + 12 && point.y <= 222) surface.dipped = true;
    art = surface.dipped ? '<g transform="scale(.75)">' + scoopArt(flavors[records.ice.dish.flavor][1]) + '</g>' : '';
    art += '<path d="M0 0l27-27" stroke="#98684f" stroke-width="7" stroke-linecap="round"/><ellipse rx="18" ry="9" fill="#afc7b6" opacity=".65"/>';
  } else art = surface.action === 'slice' ? pizzaProps.cutter : pizzaProps.pin;
  scene.querySelector('.village-effect').innerHTML = '<g transform="translate(' + point.x + ' ' + point.y + ')">' + art + '</g>';
});

function endGesture(event) {
  if (surface?.id !== event.pointerId) return;
  const { start, action, dipped } = surface;
  surface = undefined;
  scene.querySelector('.village-effect').replaceChildren();
  if (event.type !== 'pointerup') return;
  const point = svgPoint(scene, event);
  if (action === 'scoop') {
    if (dipped && iceArea(point)) perform(action);
    else find('status').textContent = 'Dip the scoop into the tub, then lift it onto your cone or cup.';
    return;
  }
  const crossed = Math.abs(point.x - start.x) >= 65 && Math.abs(point.y - start.y) <= 70;
  if (crossed && pizzaArea(point)) perform(action);
  else find('status').textContent = 'Swipe across the dough from one side to the other.';
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) scene.addEventListener(type, endGesture);

const isDragging = bindCookingButtons(shop, {
  isBusy: () => Boolean(surface),
  move(button, event) {
    const point = svgPoint(scene, event);
    const { action, value } = button.dataset;
    const art = action === 'sauce' ? pizzaProps.sauce : shops[active].toppings[value][1];
    scene.classList.toggle('village-valid', shops[active].area(point, records[active].dish));
    scene.querySelector('.village-effect').innerHTML = '<g transform="translate(' + point.x + ' ' + point.y + ')">' + art + '</g>';
  },
  clear() {
    scene.classList.remove('village-valid');
    scene.querySelector('.village-effect').replaceChildren();
  },
  drop(button, event) {
    const point = svgPoint(scene, event);
    if (shops[active].area(point, records[active].dish)) useButton(button, point);
    else find('status').textContent = 'Release the ingredient over the dish.';
  }
});
function useButton(button, point) {
  const { action, value } = button.dataset;
  if (action === 'place') {
    if (!point) {
      const index = find('position').selectedIndex;
      if (active === 'pizza') {
        const [x, y] = shops.pizza.positions[index];
        point = { x, y };
      } else {
        const [x, y] = scoopCenter(records.ice.dish.scoops.length - 1);
        const [dx, dy] = [[0,-7],[-19,-7],[19,-7],[0,-21],[0,7]][index];
        point = { x: x + dx, y: y + dy };
      }
    }
    perform(action, { id: value, ...point });
  } else perform(action, value);
}
shop.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (button && !button.disabled) useButton(button);
});

function restart(kind, recipe) {
  const current = records[kind];
  if (!current) return;
  const unfinished = current.history.length && (current.dish.stage !== 'served' ||
    !current.recipes.some(entry => JSON.stringify(entry.dish) === JSON.stringify(current.dish)));
  if (unfinished && !window.confirm('Replace this dish? Saved recipes stay in the scrapbook.')) return;
  const config = shops[kind];
  let dish = config.fresh();
  // Recall the cone or cup on replay while leaving the scooping to the player.
  if (recipe?.vessel) dish = iceAction(dish, 'vessel', recipe.vessel);
  write(kind, previous => ({ ...previous, dish, name: '', history: [] }));
}
find('reset').addEventListener('click', () => restart(active));
find('replay').addEventListener('click', () => restart(active, records[active].dish));
find('undo').addEventListener('click', () => write(active, previous => previous.history.length
  ? { ...previous, dish: previous.history.at(-1), history: previous.history.slice(0, -1) }
  : previous, () => { find('status').textContent = 'Last cooking action undone.'; }));

find('name').addEventListener('input', event => {
  const name = event.target.value;
  write(active, previous => ({ ...previous, name }));
});
find('save').addEventListener('submit', event => {
  event.preventDefault();
  const name = find('name').value.trim();
  if (!name) {
    find('status').textContent = 'Enter a name for this dish.';
    find('name').focus();
    return;
  }
  const kind = active;
  const id = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
  let saved = false;
  write(kind, previous => {
    if (previous.dish.stage !== 'served') return previous;
    saved = true;
    return { ...previous, name, recipes: [...previous.recipes, { id, name, dish: previous.dish }] };
  }, () => {
    if (!saved) return;
    document.dispatchEvent(new Event('dayquest:recipe-saved'));
    if (active === kind) {
      select('scrapbook', id);
      nav.querySelector('[data-shop=scrapbook]').focus();
    }
  });
});

export { select as openFoodShop };

async function loadShops() {
  const loaded = await Promise.all(Object.entries(shops).map(async ([key, config]) =>
    [key, await cookingRecord(db, undefined, key, config.fresh)]));
  records = Object.fromEntries(loaded);
  render();
}

document.addEventListener('dayquest:kitchens', async () => {
  if (!db) return;
  try {
    await queue;
    await loadShops();
  } catch {
    find('status').textContent = 'Reopen DayQuest to load the restored kitchens.';
  }
});

select('ramen');
try {
  db = await openCookingStore();
  await loadShops();
} catch {
  find('instructions').textContent = 'Enable site storage to use the cooking counters.';
}
