# AdashimaVerse Coding Standard

> A practical, lightweight coding standard for AdashimaVerse.
>
> The goal is **consistent, readable, maintainable code**—not forcing every file into the same style.
> Use good judgment. If following a rule would make the code harder to understand, prefer the clearer solution.

---

## 1. General Philosophy

Keep the code:

- Easy to read
- Easy to debug
- Consistent with the existing project
- Safe when elements or data are missing
- Friendly to localization
- Reasonably accessible
- Simple unless complexity is actually needed

Don't refactor working code just to make it look different.

**Prefer:**

```js
const title = document.querySelector(".page-title");

if (title) {
  title.textContent = pageTitle;
}
```

over making a large abstraction for a single DOM operation.

At the same time, don't repeat large pieces of logic unnecessarily. If something is genuinely shared, extract it.

---

# 2. JavaScript

## 2.1 Formatting

Use **4 spaces** for indentation.

```js
function loadStories() {
  const stories = getStories();

  stories.forEach((story) => {
    renderStory(story);
  });
}
```

Use braces for control-flow blocks, even when the block contains one line.

```js
if (isLoading) {
  return;
}
```

Prefer `const` by default.

```js
const stories = [];
let currentPage = 1;
```

Avoid `var` in new code.

---

## 2.2 Naming

Use descriptive names.

### Variables and functions

Use `camelCase`:

```js
const currentLanguage = "en";

function renderStories() {
  // ...
}
```

### Constants

Project constants may use either `camelCase` or `UPPER_SNAKE_CASE`.

```js
const defaultLanguage = "en";
const MAX_RESULTS = 50;
```

Don't obsess over capitalization conventions for existing code. **Consistency within a file matters more.**

### Classes

Use `PascalCase` for JavaScript classes:

```js
class MusicPlayer {
  // ...
}
```

---

## 2.3 DOM Access

Always assume that a DOM element **might not exist**.

This project has pages that share scripts, components, menus, and layouts. A script can therefore run on a page where one of its expected elements isn't present.

Avoid:

```js
document.getElementById("title").textContent = "Hello";
```

Prefer:

```js
const title = document.getElementById("title");

if (title) {
  title.textContent = "Hello";
}
```

Optional chaining is also fine for simple operations:

```js
document.querySelector(".player")?.classList.add("active");
```

This is especially important for:

- Shared scripts
- Mobile layouts
- Optional components
- Dynamically loaded content
- Language-specific sections

---

## 2.4 Event Listeners

Don't attach an event listener repeatedly when a component can be initialized more than once.

If content is dynamically rendered, consider event delegation:

```js
document.addEventListener("click", (event) => {
  const button = event.target.closest(".story-button");

  if (!button) {
    return;
  }

  openStory(button.dataset.storyId);
});
```

For dynamically loaded UI, make sure initialization happens **after the relevant content exists**.

If the project dispatches a custom event such as `menuLoaded`, use it rather than relying on timing hacks.

Avoid:

```js
setTimeout(() => {
  initializeMenu();
}, 500);
```

unless there is a genuine reason.

---

## 2.5 Async Code

Prefer `async` / `await` when it makes asynchronous code easier to follow.

```js
async function loadMusic() {
  try {
    const response = await fetch("/data/music.json");
    const data = await response.json();

    renderMusic(data);
  } catch (error) {
    console.error("Failed to load music:", error);
  }
}
```

Don't silently swallow errors unless the failure is genuinely harmless.

If an error is intentionally ignored, explain why:

```js
try {
  localStorage.setItem("theme", theme);
} catch {
  // Ignore storage failures when persistence is unavailable.
}
```

This also keeps ESLint's `no-empty` rule happy.

---

## 2.6 Error Handling

User-facing failures should be handled gracefully.

For example:

```js
try {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  renderContent(data);
} catch (error) {
  console.error("Failed to load content:", error);
  showErrorMessage();
}
```

Don't expose raw technical errors to users unless they're useful.

---

## 2.7 Avoid Fragile Timing

Avoid using arbitrary delays to "fix" initialization problems.

Bad:

```js
setTimeout(() => {
  renderPlayer();
}, 1000);
```

Better:

```js
document.addEventListener("DOMContentLoaded", renderPlayer);
```

Or, for dynamically loaded components:

```js
document.addEventListener("menuLoaded", initializeMenu);
```

The correct event is preferable to guessing how long something will take.

---

# 3. HTML

## 3.1 Structure

Use semantic HTML where practical:

```html
<header>
  <nav>
    <main>
      <section>
        <article>
          <footer></footer>
        </article>
      </section>
    </main>
  </nav>
</header>
```

Don't replace every `<div>` with a semantic element just for the sake of it. Use the element that best describes the content.

---

## 3.2 Accessibility

Interactive elements should be actual interactive elements whenever possible.

Prefer:

```html
<button type="button">Open</button>
```

instead of:

```html
<div onclick="openSomething()">Open</div>
```

Use meaningful labels:

```html
<button type="button" aria-label="Play track">...</button>
```

For expandable content, keep accessibility state synchronized:

```html
<button type="button" aria-expanded="false" aria-controls="details">Details</button>

<section id="details" hidden>...</section>
```

When the section opens:

```js
button.setAttribute("aria-expanded", "true");
details.hidden = false;
```

When it closes:

```js
button.setAttribute("aria-expanded", "false");
details.hidden = true;
```

---

# 4. CSS

## 4.1 Formatting

Use readable blocks:

```css
.story-card {
  display: flex;
  gap: 1rem;
  padding: 1.5rem;
}
```

Group related properties together when practical.

Don't worry about achieving a perfectly strict property order.

---

## 4.2 Naming

Use descriptive class names.

```css
.music-player {
}
.story-card {
}
.gallery-filter {
}
```

Avoid meaningless names:

```css
.box1 {
}
.redthing {
}
.test2 {
}
```

Existing naming conventions should generally be preserved rather than renamed throughout the project.

---

## 4.3 Responsive Design

Design for desktop and mobile.

Use existing breakpoints when possible instead of creating a new breakpoint for every component.

Before changing responsive CSS, check:

- Desktop layout
- Tablet-sized layout
- Mobile layout
- Horizontal overflow
- Touch targets
- Modals and overlays
- Long text
- Localization

**Do not break an approved mobile layout just to improve desktop styling**, or vice versa.

---

## 4.4 Avoid CSS Hacks

Don't use arbitrary values just to make automated tests pass:

```css
height: 7189px;
```

or:

```css
padding-bottom: 491px;
```

unless that value represents a genuine design requirement.

If a page height changes, find the actual component causing the change.

Likewise, avoid excessive `!important`. Use it only when there is a real cascade conflict that cannot reasonably be solved another way.

---

# 5. Localization

AdashimaVerse supports multiple languages, so new UI text should not be hardcoded into JavaScript when it belongs in translation data.

Prefer:

```js
const text = translations.searchPlaceholder;
```

over:

```js
input.placeholder = "Search";
```

Keep language-specific content in the appropriate JSON/data files.

When adding a new UI string:

1. Add the English version.
2. Add the Spanish version when applicable.
3. Keep the keys consistent.
4. Check that longer translations don't break the layout.

Never assume translated text will have the same length as English.

---

# 6. Data and JSON

Use valid, readable JSON.

```json
{
  "title": "Example",
  "description": "Example description",
  "items": []
}
```

Keep related properties together.

For multilingual data, use the project's existing structure rather than inventing a new format for one entry.

Don't duplicate large pieces of data unless there is a good reason.

---

# 7. Images and Media

Use appropriate loading strategies for large collections.

For galleries and other image-heavy pages:

- Prefer lazy loading where appropriate.
- Don't repeatedly request the same failed resource.
- Handle failed images gracefully.
- Avoid unnecessary eager preloading.
- Keep filenames and URLs correctly encoded.

For example:

```js
image.addEventListener("error", () => {
  image.onerror = null;
  image.removeAttribute("data-src");
});
```

Media URLs should be generated safely rather than manually concatenated when filenames contain spaces or special characters.

---

# 8. Components and Shared Scripts

Shared scripts should be defensive.

A script used by multiple pages should be able to encounter:

```text
element exists
element doesn't exist
element loads later
element is rendered dynamically
```

without crashing the entire page.

Good:

```js
const player = document.getElementById("musicPlayer");

if (!player) {
  return;
}

initializePlayer(player);
```

Avoid making every page include a huge number of unrelated scripts just because they're available.

---

# 9. Comments

Comments should explain **why**, not simply repeat **what** the code does.

Not useful:

```js
// Set title
title.textContent = name;
```

Useful:

```js
// Keep the Japanese title available as secondary metadata
// while the player displays the active language.
title.textContent = localizedTitle;
```

Don't comment every line.

---

# 10. ESLint

ESLint should normally stay enabled.

Don't "fix" an ESLint error by disabling the rule globally unless there is a documented project-wide reason.

For example, don't do this just to remove errors:

```js
/* eslint-disable no-empty */
```

Instead, fix the code.

For intentionally ignored errors:

```js
try {
  saveSettings();
} catch {
  // Settings persistence is optional.
}
```

Before committing JavaScript changes, ideally run:

```bash
npm run lint
```

If the project uses a different script, use the project's configured command.

---

# 11. Testing and QA

Before considering a change finished, check the affected feature manually.

For UI changes, check at least:

- Desktop
- Mobile
- English
- Spanish, if applicable
- A normal/expected state
- An empty or missing-data state
- Error/loading state when relevant

For interactive features, test the complete interaction.

For example, an expandable section should be tested as:

```text
closed
  ↓ click
open
  ↓ click
closed
```

Not just "it opens."

---

## 11.1 Visual Regression

Don't modify CSS solely because a screenshot test reports a different page height.

First determine:

1. Which section changed?
2. Why did it change?
3. Is the change intentional?
4. Is the approved screenshot still the correct design?

If the layout really should remain unchanged, fix the source of the difference.

Avoid adding arbitrary spacer elements or fixed page heights purely for QA.

---

# 12. Performance

Don't optimize prematurely.

Prefer simple code unless performance is actually a problem.

For large lists or galleries:

- Avoid unnecessary DOM work.
- Use lazy loading where useful.
- Don't repeatedly fetch the same data.
- Don't create unnecessary timers.
- Clean up event listeners where appropriate.
- Avoid loading large resources before they're needed.

Measure before making complicated optimizations.

---

# 13. Git and Changes

Keep commits focused.

Good:

```text
fix: prevent music player title localization issue
fix: handle missing gallery images
docs: update v2.3.6 changelog
```

Less useful:

```text
updated stuff
fixes
changes
```

Avoid mixing unrelated changes in the same commit when possible.

For example, don't combine:

```text
Gallery bug fix
+
music redesign
+
unrelated CSS cleanup
+
documentation rewrite
```

unless there's a reason they belong together.

---

# 14. When to Refactor

Refactor when it provides a real benefit.

Good reasons:

- The same bug keeps appearing.
- The same logic exists in several places.
- A function is becoming difficult to understand.
- A component is difficult to test.
- A shared utility would clearly simplify multiple files.

Don't refactor just because:

- The code isn't written in your preferred style.
- A function could theoretically be one line shorter.
- You want every file to look identical.
- You're already changing an unrelated feature.

**Working code is valuable.**

---

# 15. Practical Rule of Thumb

When you're unsure what to do, ask:

> **Will this make the code easier for the next person to understand and maintain?**

If yes, it's probably a good change.

If it only makes the code technically "more clever," reconsider it.

---

## Quick Checklist

Before submitting a change:

- [ ] Code is readable.
- [ ] Existing conventions were respected.
- [ ] No unnecessary global changes were made.
- [ ] DOM elements are checked when they may be absent.
- [ ] Async operations have appropriate error handling.
- [ ] No intentional empty blocks remain without explanation.
- [ ] New UI text is localized when appropriate.
- [ ] Desktop and mobile were considered.
- [ ] Accessibility state is updated for interactive UI.
- [ ] Images/media don't create unnecessary requests.
- [ ] ESLint passes.
- [ ] Relevant QA checks pass.
- [ ] No unrelated files were changed.

---

## The Short Version

**Be consistent, not rigid.**

Write code that is understandable, defensive, localized, accessible, and easy to debug. Follow the project's existing patterns before introducing new ones, and fix the actual cause of a problem instead of hiding the symptom.
