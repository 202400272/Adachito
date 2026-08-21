(() => {
  let translations = {};
  let currentLang = "es";
  const scriptBase = document.currentScript
    ? new URL(".", document.currentScript.src)
    : new URL("/src/js/", window.location.href);

  const STORAGE_KEYS = ["lang", "preferredLanguage", "language", "adashima_manga_lang"];

  const normalizeLanguage = (value) => {
    if (value === "en") return "en";
    if (value === "tg") return "tg";
    return "es";
  };

  const getLanguage = () => {
    for (const key of STORAGE_KEYS) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) return normalizeLanguage(stored);
      } catch {
        // Ignore storage exceptions and continue.
      }
    }
    return "es";
  };

  const getValue = (path) => path.split(".").reduce((obj, key) => obj?.[key], translations);

  async function fetchTranslations(lang) {
    const url = new URL(`../data/help/${lang}.json`, scriptBase);
    url.searchParams.set("v", Math.floor(Date.now() / 86400000));
    const response = await fetch(url.href, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Help translations HTTP ${response.status}`);
    return response.json();
  }

  async function loadTranslations(lang = getLanguage()) {
    const requestedLang = normalizeLanguage(lang);

    try {
      translations = await fetchTranslations(requestedLang);
      currentLang = requestedLang;
    } catch (error) {
      if (requestedLang !== "en") {
        translations = await fetchTranslations("en");
        currentLang = "en";
      } else {
        throw error;
      }
    }
  }

  const escapeAttr = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const FAN_GUIDE_UI = {
    en: {
      label: "START HERE",
      introTitle: "Start with the story. Choose your route from there.",
      introText:
        "The light novels are the original source, so they are the clearest starting point if you want the fullest experience. The anime and manga are still good entry points if that is how you prefer to discover the series. Choose the route that fits you, then use the sections below to understand what each path gives you—and what you might miss.",
      chooseTitle: "Where are you coming from?",
      chooseHint:
        "Pick the situation that fits you best. The recommendation changes, but every route eventually leads back to the same core story.",
      choices: [
        ["new", "I'm completely new", "I want the fullest story", "fa-book-open"],
        ["anime", "I found it through the anime", "I want to continue", "fa-tv"],
        ["manga", "I prefer manga", "I want a visual-first route", "fa-book"],
        ["complete", "I want everything", "Show me the complete path", "fa-layer-group"],
      ],
      routeTitle: "Your route",
      routeMessages: {
        new: "Light Novel Volume 1 → continue in publication order → explore adaptations and supplementary material as you like.",
        anime:
          "Anime → Manga chapter 26 or Light Novel Volume 5 to continue → Volume 1 recommended for the fullest experience.",
        manga:
          "Choose the 2016 Mani version for a short, completed adaptation, or the 2019 Moke Yuzuhara version for the longer-running adaptation.",
        complete:
          "Light Novel Volume 1 → novels in publication order → manga/anime → relevant Extra Stories → explore the archive.",
      },
      pathTitle: "The big picture",
      pathSub: "Think of the archive as layers around one central story.",
      sourceTitle: "Light Novels",
      sourceMeta: "Original source material",
      sourceText:
        "Start with Volume 1 and follow the novels in publication order. This is the only part you need to understand the main story from beginning to end.",
      branchTitle: "Adaptations",
      branchMeta: "Anime + two manga versions",
      branchText:
        "Optional ways to experience the same story visually. They can stand on their own, but they do not replace the source material.",
      extrasTitle: "Extra Stories",
      extrasMeta: "Supplementary material",
      extrasText:
        "These sit outside the main sequence. Read them after the volume, event, or release they are connected to.",
      archiveTitle: "Archive extras",
      archiveMeta: "Gallery + Drama CDs + Music",
      archiveText:
        "Explore these whenever you like. They add context, audio, art, and other extras without changing the main reading order.",
      whyTitle: "Why are the light novels the recommended starting point?",
      whyText:
        "They are the original source material and provide the fullest version of the story. Adachi and Shimamura's inner thoughts, narration, conversations, pacing, and smaller scene details can be shortened or omitted when the story is adapted to another format.",
      animeTitle: "Finished the anime? Here are your two continuation points.",
      animeText:
        "You have two ways to continue: pick up the manga from approximately chapter 26, or continue directly with the light novels from Volume 5. If you want the original story with its full narration and character thoughts, we still recommend returning to Volume 1.",
      orderTitle: "The simplest reading order",
      orderText:
        "Follow the numbered light novels in order, with Volume 99.9 placed between Volumes 9 and 10. Volume 99.9 is part of the novel material; the only detail to remember is where it fits.",
      mangaTitle: "The two manga adaptations",
      manga2016: "2016 — Mani",
      manga2016Text:
        "A short, completed 3-volume adaptation covering the beginning of the story, up to Volume 3 of the light novels. It was serialized in Gangan Online and was never officially localized in English.",
      manga2019: "2019 — Moke Yuzuhara",
      manga2019Text:
        "The longer-running and more recognizable adaptation, serialized in Monthly Comic Dengeki Daioh. It is licensed by Yen Press in English and continues beyond the point covered by the 2020 anime.",
      mangaChoice:
        "Which one should you read first? It's entirely up to you. If you want the manga that covers more of the story, the 2019 version is the one to go with—but you can't go wrong with either or both.",
      completeTitle: "You do not have to read everything",
      completeText:
        "The light novels are the core path. The manga and anime are adaptations, while Extra Stories, Special Novels, Drama CDs, Music, Gallery, Timeline, and Constellation add more ways to explore the series. You can skip any of them and still follow the main story without confusion.",
      steps: ["01", "02", "03", "04"],
      detailsLabel: "Full explanation",
      openLabel: "Read explanation",
      closeLabel: "Hide explanation",
    },
    es: {
      label: "EMPIEZA AQUÍ",
      introTitle: "No hay una única forma correcta de entrar: elige la experiencia que buscas.",
      introText:
        "Las novelas ligeras son la historia original, pero el anime y el manga también son formas válidas de descubrir Adachi y Shimamura. Usa el esquema para encontrar tu ruta y después consulta la explicación completa.",
      chooseTitle: "¿Qué ruta se parece más a ti?",
      chooseHint:
        "Tu elección cambia la recomendación. Nada queda bloqueado: puedes explorar todo después.",
      choices: [
        ["new", "Soy completamente nuevo", "Quiero la historia más completa", "fa-book-open"],
        ["anime", "Llegué por el anime", "Quiero continuar", "fa-tv"],
        ["manga", "Prefiero el manga", "Quiero una ruta visual", "fa-book"],
        ["complete", "Quiero verlo todo", "Muéstrame la ruta completa", "fa-layer-group"],
      ],
      routeTitle: "Tu ruta",
      routeMessages: {
        new: "Volumen 1 de las novelas → continúa en orden de publicación → explora las adaptaciones y el material complementario cuando quieras.",
        anime:
          "Anime → capítulo 26 del manga o Volumen 5 de las novelas para continuar → Volumen 1 recomendado para la experiencia más completa.",
        manga:
          "Elige la versión de 2016 de Mani para una adaptación corta y completa, o la de 2019 de Moke Yuzuhara para la adaptación más extensa.",
        complete:
          "Volumen 1 de las novelas → novelas en orden de publicación → manga/anime → Historias adicionales relacionadas → explora el archivo.",
      },
      pathTitle: "La ruta principal",
      pathSub: "La historia principal es más sencilla de lo que el archivo puede hacer parecer.",
      sourceTitle: "Novelas ligeras",
      sourceMeta: "Material original",
      sourceText:
        "Empieza con el Volumen 1. Es la ruta recomendada si quieres la versión más completa de la historia.",
      branchTitle: "Adaptaciones",
      branchMeta: "Anime + dos versiones del manga",
      branchText:
        "Son rutas visuales opcionales. Elige el formato que prefieras; ninguno sustituye a las novelas.",
      extrasTitle: "Historias adicionales",
      extrasMeta: "Material complementario",
      extrasText:
        "Léelas después de llegar a la parte de la historia con la que estén relacionadas.",
      archiveTitle: "Extras del archivo",
      archiveMeta: "Galería + Drama CDs + Música",
      archiveText:
        "Explóralos libremente. Complementan la historia, pero no determinan su orden de lectura.",
      whyTitle: "¿Por qué empezar por las novelas ligeras?",
      whyText:
        "Son el material original y ofrecen la versión más completa de la historia. Los pensamientos internos de Adachi y Shimamura, la narración, las conversaciones, el ritmo y los pequeños detalles de las escenas pueden acortarse u omitirse al adaptar la historia a otro formato.",
      animeTitle: "¿Ya viste el anime?",
      animeText:
        "Tienes dos formas de continuar: retomar el manga aproximadamente desde el capítulo 26 o continuar directamente con las novelas desde el Volumen 5. Si quieres la historia original con toda su narración y pensamientos de los personajes, recomendamos volver al Volumen 1.",
      orderTitle: "El orden más sencillo",
      orderText:
        "Sigue las novelas numeradas en orden de publicación y coloca el Volumen 99.9 entre los Volúmenes 9 y 10. El Volumen 99.9 forma parte del material de las novelas; lo único que necesitas recordar es dónde encaja.",
      mangaTitle: "Las dos adaptaciones en manga",
      manga2016: "2016 — Mani",
      manga2016Text:
        "Una adaptación corta y completa de 3 volúmenes que cubre el comienzo de la historia, hasta el Volumen 3 de las novelas. Se publicó en Gangan Online y nunca fue localizada oficialmente al inglés.",
      manga2019: "2019 — Moke Yuzuhara",
      manga2019Text:
        "La adaptación más extensa y reconocible, publicada en Monthly Comic Dengeki Daioh. Está licenciada por Yen Press en inglés y continúa más allá del punto cubierto por el anime de 2020.",
      mangaChoice:
        "¿Cuál deberías leer primero? Depende de ti. Si quieres el manga que cubre más historia, el de 2019 es la mejor opción, pero cualquiera de los dos—o ambos—es una buena elección.",
      completeTitle: "No necesitas consumirlo todo",
      completeText:
        "Las novelas ligeras son el núcleo. El manga y el anime adaptan esa historia, mientras que las Historias adicionales, las Novelas especiales, los Drama CDs, la Música, la Galería, la Línea temporal y Constelación amplían o complementan la experiencia. Puedes disfrutar de todo o solo de una parte del archivo sin complicar el orden principal.",
      steps: ["01", "02", "03", "04"],
      detailsLabel: "Explicación completa",
      openLabel: "Leer explicación",
      closeLabel: "Ocultar explicación",
    },
    tg: {
      label: "START HERE",
      introTitle: "Walang iisang tamang paraan para magsimula—piliin ang experience na gusto mo.",
      introText:
        "Ang light novels ang original na kuwento, pero valid ding entry points ang anime at manga. Gamitin ang guide para piliin ang ruta mo, pagkatapos ay basahin ang buong paliwanag.",
      chooseTitle: "Anong route ang para sa iyo?",
      chooseHint:
        "Babaguhin ng choice mo ang recommendation. Walang kailangang i-lock—maaari mong tuklasin ang lahat mamaya.",
      choices: [
        ["new", "Baguhan ako", "Gusto ko ang pinakakumpletong kuwento", "fa-book-open"],
        ["anime", "Galing ako sa anime", "Gusto kong magpatuloy", "fa-tv"],
        ["manga", "Mas gusto ko ang manga", "Visual-first ang gusto ko", "fa-book"],
        ["complete", "Gusto ko lahat", "Ipakita ang buong route", "fa-layer-group"],
      ],
      routeTitle: "Iyong route",
      routeMessages: {
        new: "Light Novel Volume 1 → sundan ang publication order → tuklasin ang adaptations at supplementary material kapag gusto mo.",
        anime:
          "Anime → Manga chapter 26 o Light Novel Volume 5 para magpatuloy → Volume 1 ang recommended para sa pinakakumpletong experience.",
        manga:
          "Piliin ang 2016 Mani version para sa maikli at kumpletong adaptation, o ang 2019 Moke Yuzuhara version para sa mas mahabang adaptation.",
        complete:
          "Light Novel Volume 1 → novels ayon sa publication order → manga/anime → kaugnay na Extra Stories → tuklasin ang archive.",
      },
      pathTitle: "Main path",
      pathSub: "Mas simple ang main story kaysa sa maaaring ipahiwatig ng archive.",
      sourceTitle: "Light Novels",
      sourceMeta: "Original source material",
      sourceText:
        "Magsimula sa Volume 1. Ito ang recommended route kung gusto mo ang pinakakumpletong bersyon ng kuwento.",
      branchTitle: "Adaptations",
      branchMeta: "Anime + dalawang manga version",
      branchText:
        "Optional visual routes ang mga ito. Piliin ang format na gusto mo; walang pumapalit sa novels.",
      extrasTitle: "Extra Stories",
      extrasMeta: "Supplementary material",
      extrasText: "Basahin kapag narating mo na ang kaugnay na bahagi ng kuwento.",
      archiveTitle: "Archive extras",
      archiveMeta: "Gallery + Drama CDs + Music",
      archiveText:
        "Malaya mong tuklasin ang mga ito. Dagdag ang mga ito sa experience pero hindi required sa reading order.",
      whyTitle: "Bakit light novels ang simula?",
      whyText:
        "Sila ang original source material at nagbibigay ng pinakakumpletong bersyon ng kuwento. Maaaring paikliin o alisin sa adaptations ang inner thoughts, narration, conversations, pacing, at maliliit na detalye ng mga eksena.",
      animeTitle: "Napanood mo na ang anime?",
      animeText:
        "May dalawang paraan para magpatuloy: manga chapter 26 o humigit-kumulang, o Light Novel Volume 5. Kung gusto mo ang original story kasama ang narration at character thoughts, mas inirerekomenda pa rin ang Volume 1.",
      orderTitle: "Pinakasimpleng order",
      orderText:
        "Sundan ang numbered light novels ayon sa publication order, at ilagay ang Volume 99.9 sa pagitan ng Volumes 9 at 10. Bahagi ng novel material ang Volume 99.9; ang mahalaga ay alam mo kung saan ito inilalagay.",
      mangaTitle: "Dalawang manga adaptations",
      manga2016: "2016 — Mani",
      manga2016Text:
        "Maikli at kumpletong 3-volume adaptation ng simula ng kuwento, hanggang Volume 3 ng novels. Na-serialize ito sa Gangan Online at walang official English localization.",
      manga2019: "2019 — Moke Yuzuhara",
      manga2019Text:
        "Mas mahaba at mas kilalang adaptation na na-serialize sa Monthly Comic Dengeki Daioh. Licensed ito ng Yen Press sa English at nagpapatuloy lampas sa sakop ng 2020 anime.",
      mangaChoice:
        "Alin ang dapat basahin muna? Nasa iyo. Kung gusto mo ang manga na mas maraming story ang sakop, piliin ang 2019 version—pero okay ang alinman o pareho.",
      completeTitle: "Hindi mo kailangang ubusin lahat",
      completeText:
        "Ang light novels ang core. Ina-adapt ng manga at anime ang kuwento, habang pinapalawak o dinadagdagan ito ng Extra Stories, Special Novels, Drama CDs, Music, Gallery, Timeline, at Constellation. Maaari mong piliin kung gaano karami ang gusto mong tuklasin nang hindi ginagawang komplikado ang main reading order.",
      steps: ["01", "02", "03", "04"],
      detailsLabel: "Buong paliwanag",
      openLabel: "Basahin ang paliwanag",
      closeLabel: "Itago ang paliwanag",
    },
  };

  function renderFanGuide(section) {
    const t = FAN_GUIDE_UI[currentLang] || FAN_GUIDE_UI.en;
    const items = section.items || [];
    const getItem = (index) => items[index] || { question: "", answer: "" };

    const routeCards = t.choices
      .map(
        ([id, title, subtitle, icon], index) => `
      <button class="fan-route-card ${index === 0 ? "is-selected" : ""}" type="button" data-route="${escapeAttr(id)}" aria-pressed="${index === 0}">
        <span class="fan-route-card-icon"><i class="fa-solid ${escapeAttr(icon)}"></i></span>
        <span class="fan-route-card-copy"><strong>${title}</strong><small>${subtitle}</small></span>
        <span class="fan-route-card-check"><i class="fa-solid fa-check"></i></span>
      </button>`,
      )
      .join("");

    const routePanel = (id, title, text, icon) => `
      <div class="fan-route-result-panel ${id === "new" ? "is-active" : ""}" data-route-panel="${id}">
        <span class="fan-route-result-icon"><i class="fa-solid ${icon}"></i></span>
        <div><span class="fan-guide-overline">${t.routeTitle}</span><strong>${title}</strong><p>${text}</p></div>
      </div>`;

    const detail = (number, item, icon, featured = false) => `
      <details class="fan-content-card ${featured ? "fan-content-card-featured" : ""}" ${featured ? "open" : ""}>
        <summary>
          <span class="fan-content-number">${number}</span>
          <span class="fan-content-summary"><strong>${item.question}</strong><small>${featured ? t.openLabel : t.detailsLabel}</small></span>
          <span class="fan-content-icon"><i class="fa-solid ${icon}"></i></span>
          <i class="fa-solid fa-chevron-down fan-content-chevron"></i>
        </summary>
        <div class="fan-content-body"><div class="fan-content-body-inner">${item.answer}</div></div>
      </details>`;

    const manga = getItem(2);
    const anime = getItem(3);
    const watched = getItem(4);
    const extras = getItem(5);
    const _order = getItem(6);

    return `
      <section class="help-section help-section-fan-guide" id="${escapeAttr(section.id)}">
        <div class="help-section-heading">
          <span><i class="fa-solid ${escapeAttr(section.icon)}"></i></span>
          <div><p class="help-eyebrow">${section.eyebrow}</p><h2>${section.title}</h2></div>
        </div>

        <div class="fan-guide" data-fan-guide>
          <header class="fan-guide-intro">
            <div class="fan-guide-intro-main">
              <span class="fan-guide-label"><i class="fa-solid fa-route"></i> ${t.label}</span>
              <h3>${t.introTitle}</h3>
              <p>${t.introText}</p>
            </div>
            <aside class="fan-guide-answer">
              <span class="fan-guide-answer-icon"><i class="fa-solid fa-book-open"></i></span>
              <span><small>START WITH</small><strong>Light Novel<br>Volume 1</strong></span>
            </aside>
          </header>

          <section class="fan-guide-decider">
            <div class="fan-guide-section-head">
              <span class="fan-guide-section-kicker">01</span>
              <div><h4>${t.chooseTitle}</h4><p>${t.chooseHint}</p></div>
            </div>
            <div class="fan-route-grid">${routeCards}</div>
            <div class="fan-route-results">
              ${routePanel("new", t.choices[0][1], t.routeMessages.new, "fa-book-open")}
              ${routePanel("anime", t.choices[1][1], t.routeMessages.anime, "fa-tv")}
              ${routePanel("manga", t.choices[2][1], t.routeMessages.manga, "fa-book")}
              ${routePanel("complete", t.choices[3][1], t.routeMessages.complete, "fa-layer-group")}
            </div>
          </section>

          <section class="fan-guide-main-path">
            <div class="fan-guide-section-head fan-guide-section-head-wide">
              <span class="fan-guide-section-kicker">02</span>
              <div><h4>${t.pathTitle}</h4><p>${t.pathSub}</p></div>
            </div>
            <div class="fan-main-flow">
              <div class="fan-flow-node fan-flow-primary"><span class="fan-flow-node-icon"><i class="fa-solid fa-book-open"></i></span><small>01</small><strong>${t.sourceTitle}</strong><em>${t.sourceMeta}</em><p>${t.sourceText}</p></div>
              <div class="fan-flow-connector"><i class="fa-solid fa-arrow-right"></i></div>
              <div class="fan-flow-node"><span class="fan-flow-node-icon"><i class="fa-solid fa-shuffle"></i></span><small>02</small><strong>${t.branchTitle}</strong><em>${t.branchMeta}</em><p>${t.branchText}</p></div>
              <div class="fan-flow-connector"><i class="fa-solid fa-arrow-right"></i></div>
              <div class="fan-flow-node"><span class="fan-flow-node-icon"><i class="fa-solid fa-layer-group"></i></span><small>03</small><strong>${t.extrasTitle}</strong><em>${t.extrasMeta}</em><p>${t.extrasText}</p></div>
              <div class="fan-flow-connector"><i class="fa-solid fa-arrow-right"></i></div>
              <div class="fan-flow-node"><span class="fan-flow-node-icon"><i class="fa-solid fa-images"></i></span><small>04</small><strong>${t.archiveTitle}</strong><em>${t.archiveMeta}</em><p>${t.archiveText}</p></div>
            </div>
          </section>

          <section class="fan-guide-why">
            <div class="fan-guide-why-mark"><i class="fa-solid fa-lightbulb"></i></div>
            <div><span class="fan-guide-overline">THE REASON</span><h4>${t.whyTitle}</h4><p>${getItem(0).answer || t.whyText}</p></div>
          </section>

          <section class="fan-guide-reading-options">
            <div class="fan-guide-section-head fan-guide-section-head-wide">
              <span class="fan-guide-section-kicker">03</span>
              <div><h4>${t.detailsLabel}</h4><p>${t.openLabel}. The full context stays here when you need it.</p></div>
            </div>
            <div class="fan-content-grid">
              ${detail("01", getItem(1), "fa-book-open", true)}
              ${detail("02", manga, "fa-book")}
              ${detail("03", anime, "fa-tv")}
              ${detail("04", watched, "fa-forward")}
              ${detail("05", extras, "fa-layer-group")}
            </div>
          </section>

          <section class="fan-guide-order">
            <div class="fan-guide-section-head fan-guide-section-head-wide fan-order-heading">
              <span class="fan-guide-section-kicker">04</span>
              <div>
                <span class="fan-guide-overline">THE READING ORDER</span>
                <h4>${t.orderTitle}</h4>
                <p>${t.orderText}</p>
              </div>
            </div>

            <div class="fan-order-core">
              <span class="fan-order-label">RECOMMENDED READING PATH</span>
              <div class="fan-order-sequence" aria-label="Recommended light novel reading order">
                <span><b>01</b><strong>Volume 1</strong></span>
                <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                <span><b>02–09</b><strong>Volumes 2–9</strong></span>
                <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                <span class="fan-order-special"><b>99.9</b><strong>Volume 99.9</strong><em>recommended placement</em></span>
                <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                <span><b>10+</b><strong>Volume 10 onward</strong></span>
              </div>
            </div>

            <div class="fan-order-placement">
              <div class="fan-order-placement-head">
                <span class="fan-order-placement-mark"><i class="fa-solid fa-book-bookmark"></i></span>
                <div>
                  <span class="fan-order-label">WHERE VOLUME 99.9 FITS</span>
                  <h5>Volume 99.9 is part of the novel material.</h5>
                </div>
              </div>
              <p>Volume 99.9 collects the <strong>Special Novels</strong> originally included with the Japanese Blu-ray releases of the 2020 anime. Those stories were released after <strong>Volume 9</strong> and before <strong>Volume 10</strong>, so we recommend reading Volume 99.9 between them.</p>
              <div class="fan-order-placement-sequence" aria-label="Volume 99.9 placement between Volume 9 and Volume 10">
                <span><b>09</b><strong>Volume 9</strong></span>
                <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                <span class="is-highlighted"><b>99.9</b><strong>Volume 99.9</strong></span>
                <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                <span><b>10</b><strong>Volume 10</strong></span>
              </div>
            </div>

            <div class="fan-order-note">
              <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
              <p><strong>There is no need to make 99.9 a separate decision.</strong> The only question is where to place it. The recommended placement is between Volumes 9 and 10; Extra Stories are separate supplementary material and should instead be read according to the volume, event, or release they are associated with.</p>
            </div>
          </section>

          <section class="fan-guide-manga">
            <div class="fan-guide-section-head fan-guide-section-head-wide">
              <span class="fan-guide-section-kicker">05</span>
              <div><h4>${t.mangaTitle}</h4><p>${t.mangaChoice}</p></div>
            </div>
            <div class="fan-manga-grid">
              <article><span class="fan-manga-year">2016</span><div><h5>Mani</h5><p>${t.manga2016Text}</p></div><span class="fan-manga-tag">SHORT · COMPLETE</span></article>
              <article class="is-recommended"><span class="fan-manga-year">2019</span><div><h5>Moke Yuzuhara</h5><p>${t.manga2019Text}</p></div><span class="fan-manga-tag">LONGER · RECOMMENDED FOR MORE STORY</span></article>
            </div>
          </section>

          <section class="fan-guide-final">
            <span class="fan-guide-final-icon"><i class="fa-solid fa-compass"></i></span>
            <div><span class="fan-guide-overline">ONE LAST THING</span><h4>${t.completeTitle}</h4><p>${t.completeText}</p></div>
          </section>
        </div>
      </section>`;
  }

  function setupFanGuide() {
    document.querySelectorAll("[data-fan-guide]").forEach((root) => {
      if (root.dataset.ready === "true") return;
      root.dataset.ready = "true";
      root.querySelectorAll("[data-route]").forEach((button) => {
        button.addEventListener("click", () => {
          const route = button.dataset.route;
          root.querySelectorAll("[data-route]").forEach((item) => {
            const selected = item === button;
            item.classList.toggle("is-selected", selected);
            item.setAttribute("aria-pressed", selected ? "true" : "false");
          });
          root.querySelectorAll("[data-route-panel]").forEach((panel) => {
            panel.classList.toggle("is-active", panel.dataset.routePanel === route);
          });
        });
      });
    });
  }

  function renderHelp() {
    const categoryRoot = document.getElementById("helpCategories");
    const sectionRoot = document.getElementById("helpSections");
    if (!categoryRoot || !sectionRoot) return;

    categoryRoot.innerHTML = (translations.categories || [])
      .map(
        (category) => `
      <a class="help-category" href="#${escapeAttr(category.id)}">
        <span class="help-category-icon"><i class="fa-solid ${escapeAttr(category.icon)}"></i></span>
        <span><strong>${category.title}</strong><small>${category.description}</small></span>
      </a>
    `,
      )
      .join("");

    sectionRoot.innerHTML = (translations.sections || [])
      .map((section) => {
        if (section.id === "new-fan-guide") return renderFanGuide(section);
        return `
        <section class="help-section" id="${escapeAttr(section.id)}">
          <div class="help-section-heading">
            <span><i class="fa-solid ${escapeAttr(section.icon)}"></i></span>
            <div><p class="help-eyebrow">${section.eyebrow}</p><h2>${section.title}</h2></div>
          </div>
          <div class="help-card-list">
            ${(section.items || [])
              .map(
                (item, index) => `
              <article class="help-card" data-help-index="${index}">
                <h3>${item.question}</h3>
                <p>${item.answer}</p>
              </article>
            `,
              )
              .join("")}
          </div>
        </section>
      `;
      })
      .join("");

    document.title = translations.pageTitle || document.title;
    document.documentElement.lang = currentLang;
  }

  function applyStaticLanguage() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const value = getValue(el.dataset.i18n);
      if (value !== undefined) el.innerHTML = value;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const value = getValue(el.dataset.i18nPlaceholder);
      if (value !== undefined) el.placeholder = value;
    });
  }

  function initMenu() {
    const menuVer = Math.floor(Date.now() / 86400000);
    fetch(`/src/components/menu.html?v=${menuVer}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Menu HTTP ${r.status}`);
        return r.text();
      })
      .then((data) => {
        const doc = new DOMParser().parseFromString(data, "text/html");
        const frag = document.createDocumentFragment();
        [...doc.head.childNodes, ...doc.body.childNodes].forEach((node) => {
          if (node.nodeName.toLowerCase() === "script") {
            const script = document.createElement("script");
            if (node.src) script.src = node.src;
            else script.textContent = node.textContent;
            frag.appendChild(script);
          } else {
            frag.appendChild(node.cloneNode(true));
          }
        });
        const container = document.getElementById("sidebar-container");
        if (!container) return;
        container.replaceChildren(frag);
        requestAnimationFrame(() => {
          if (window.translateMenu)
            window.translateMenu(localStorage.getItem("lang") || currentLang);
          document.dispatchEvent(new CustomEvent("menuLoaded"));
        });
      })
      .catch((error) => console.warn("menu.html unavailable:", error.message));
  }

  function setupSearch() {
    const input = document.getElementById("helpSearch");
    const noResults = document.querySelector(".help-no-results");
    if (!input || input.dataset.ready === "true") return;
    input.dataset.ready = "true";

    const filter = () => {
      const query = input.value.trim().toLowerCase();
      let matches = 0;
      document.querySelectorAll(".help-section").forEach((section) => {
        const sectionText = section.textContent.toLowerCase();
        const fanGuide = section.classList.contains("help-section-fan-guide");
        let sectionMatches = 0;

        if (fanGuide) {
          const show = !query || sectionText.includes(query);
          section.hidden = !show;
          sectionMatches = show ? 1 : 0;
        } else {
          const headingText =
            section.querySelector(".help-section-heading")?.textContent.toLowerCase() || "";
          section.querySelectorAll(".help-card").forEach((card) => {
            const show =
              !query ||
              card.textContent.toLowerCase().includes(query) ||
              headingText.includes(query);
            card.classList.toggle("is-hidden", !show);
            if (show) sectionMatches++;
          });
          section.hidden = sectionMatches === 0;
        }

        matches += sectionMatches;
      });
      document.querySelectorAll(".help-category").forEach((category) => {
        category.classList.toggle(
          "is-hidden",
          !!query && !category.textContent.toLowerCase().includes(query),
        );
      });
      const meta = document.getElementById("helpSearchMeta");
      if (meta) {
        const idleText =
          getValue("hero.searchMeta") || "Search questions, features, settings, or archive terms.";
        meta.textContent = query
          ? `${matches} ${matches === 1 ? "help topic" : "help topics"} found`
          : idleText;
      }
      if (noResults) {
        noResults.textContent = translations.noResults || "No matching help topics found.";
        noResults.hidden = !query || matches > 0;
      }
    };

    input.addEventListener("input", filter);
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "/" &&
        document.activeElement !== input &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
      ) {
        event.preventDefault();
        input.focus();
      }
    });
    filter();
  }

  function showLoadError() {
    const root = document.getElementById("helpSections");
    if (!root) return;
    root.innerHTML = `<div class="help-load-error"><i class="fa-solid fa-circle-exclamation"></i><h2>Help content could not be loaded.</h2><p>Please refresh the page and try again.</p></div>`;
  }

  document.addEventListener("languageChanged", async (event) => {
    const lang = event.detail?.lang || getLanguage();
    try {
      await loadTranslations(lang);
      renderHelp();
      applyStaticLanguage();
      setupSearch();
      setupFanGuide();
    } catch (error) {
      console.warn("Help translation unavailable:", error.message);
      showLoadError();
    }
  });

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await loadTranslations();
      renderHelp();
      applyStaticLanguage();
      setupSearch();
      setupFanGuide();
    } catch (error) {
      console.warn("Help translation unavailable:", error.message);
      showLoadError();
    }
    initMenu();
  });
})();
