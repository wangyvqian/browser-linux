// A tiny context-menu registry. Anything can add an action; the menu owns
// rendering, positioning and dismissal, so features never touch DOM plumbing.
//
//   register({ id, label, order?, shown?, danger?, run })
//
// `shown(ctx)` decides visibility at open time, `run(ctx)` gets the target the
// user right-clicked. window.browserLinux.menu is the same object, so the dev
// console can register actions too.

const items = [];
let root = null;
let closeOn = null;

export function register(item) {
  items.push(item);
  items.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

function build(entries, ctx) {
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.setAttribute("role", "menu");
  for (const item of entries) {
    if (item.separator) {
      menu.append(document.createElement("hr"));
      continue;
    }
    if (item.shown && !item.shown(ctx)) continue;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ctx-item";
    row.setAttribute("role", "menuitem");
    if (item.danger) row.classList.add("danger");
    row.textContent = typeof item.label === "function" ? item.label(ctx) : item.label;
    row.addEventListener("click", () => {
      close();
      item.run(ctx);
    });
    menu.append(row);
  }
  return menu;
}

export function close() {
  root?.remove();
  root = null;
  closeOn?.();
  closeOn = null;
}

export function attach(target, context = () => ({})) {
  target.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    close();

    const ctx = { event, target, ...context() };
    const menu = build(items, ctx);
    if (!menu.querySelector(".ctx-item")) return;

    document.body.append(menu);
    const { innerWidth: w, innerHeight: h } = window;
    menu.style.left = `${Math.min(event.clientX, w - menu.offsetWidth - 8)}px`;
    menu.style.top = `${Math.min(event.clientY, h - menu.offsetHeight - 8)}px`;
    root = menu;

    const dismiss = (e) => {
      if (menu.contains(e.target)) return;
      close();
    };
    const onKey = (e) => e.key === "Escape" && close();
    setTimeout(() => {
      document.addEventListener("pointerdown", dismiss, { once: true });
      document.addEventListener("keydown", onKey);
    }, 0);
    closeOn = () => document.removeEventListener("keydown", onKey);
  });
}
