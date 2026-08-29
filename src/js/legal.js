const LEGAL_LANGUAGE_KEY = "lang";
const LEGAL_DEFAULT_LANGUAGE = "es";
let englishMarkup = new Map();

const COMMON = {
  es: {
    back: "← Volver al inicio",
    eyebrow: "Información del sitio",
    onPage: "En esta página",
    updated: "Última actualización: 21 de agosto de 2026",
    privacy: "Privacidad",
    terms: "Términos y aviso legal",
    brand: "ADASHIMAVERSE",
    language: "Idioma",
  },
  en: {
    back: "← Back to home",
    eyebrow: "Site information",
    onPage: "On this page",
    updated: "Last updated: August 21, 2026",
    privacy: "Privacy",
    terms: "Terms & Disclaimer",
    brand: "ADASHIMAVERSE",
    language: "Language",
  },
};

const CONTENT = {
  privacy: {
    es: {
      title: "Política de privacidad",
      lead: "Una explicación clara de cómo AdashimaVerse gestiona la información, el contenido de fans y el propio sitio.",
      toc: [
        "Información que recopilamos",
        "Envío de comentarios",
        "Almacenamiento local",
        "Servicios de terceros",
        "Conservación y uso compartido",
        "Tus derechos de privacidad",
        "Privacidad infantil",
        "Cambios",
      ],
      sections: {
        collection: [
          "Información que recopilamos",
          "La mayor parte de AdashimaVerse puede consultarse sin crear una cuenta ni proporcionar directamente información personal.",
          "Podemos recibir información cuando utilizas voluntariamente la función de comentarios del sitio.",
        ],
        feedback: [
          "Envío de comentarios",
          "Cuando envías comentarios, la siguiente información puede transmitirse a nuestro servicio de comentarios:",
          "Tipo, título y descripción del comentario",
          "Tu dirección de correo electrónico, si decides proporcionarla",
          "La URL y el título de la página",
          "Versión del sitio web",
          "Información del navegador y del sistema operativo",
          "Resolución de pantalla y dimensiones de la ventana",
          "Idioma y zona horaria",
          "Fecha y hora del envío",
          "Usamos esta información para revisar comentarios, investigar problemas técnicos, mejorar el sitio web y responder cuando proporcionas voluntariamente datos de contacto.",
          "No envíes contraseñas, información de pago ni otros datos altamente sensibles mediante el formulario de comentarios.",
        ],
        storage: [
          "Almacenamiento local",
          "AdashimaVerse utiliza el almacenamiento local del navegador para recordar determinadas preferencias y funciones, como el idioma, la apariencia, la configuración del lector, las preferencias de visualización y el progreso de reproducción.",
          "Un formulario de comentarios sin terminar también puede guardarse temporalmente en tu navegador para que un cierre accidental de la página no borre inmediatamente el borrador. Estos valores locales no se envían a AdashimaVerse solo por existir en tu navegador.",
          "Puedes borrar el almacenamiento local desde la configuración de datos del sitio o privacidad de tu navegador. Al hacerlo, es posible que se restablezcan las preferencias o el progreso guardados.",
        ],
        cookies: [
          "Cookies y publicidad",
          "AdashimaVerse no utiliza actualmente cookies para publicidad ni seguimiento de comportamiento entre sitios. El sitio puede utilizar almacenamiento del navegador y servicios de terceros necesarios para determinadas funciones.",
        ],
        "third-party": [
          "Servicios de terceros",
          "El sistema de comentarios utiliza EmailJS para transmitir los envíos. EmailJS puede procesar metadatos de las solicitudes según sus propias políticas.",
          "AdashimaVerse también puede cargar o enlazar sitios web, contenidos multimedia, fuentes y servicios de terceros. Esos servicios operan bajo sus propias políticas de privacidad, que AdashimaVerse no controla.",
        ],
        retention: [
          "Conservación y uso compartido",
          "Los comentarios pueden conservarse durante el tiempo razonablemente necesario para revisarlos, investigar problemas, mantener registros del sitio o responder a la persona que los envió. También pueden aplicarse los periodos de conservación del servicio de terceros.",
          "AdashimaVerse no vende ni alquila información de los visitantes. La información puede divulgarse cuando lo exija la ley aplicable o cuando sea razonablemente necesario para proteger el sitio, a sus usuarios o los derechos y la seguridad de otras personas.",
        ],
        security: [
          "Seguridad de los datos",
          "Tomamos medidas razonables para evitar la recopilación innecesaria y proteger la información gestionada a través del sitio web. Sin embargo, ninguna transmisión por internet ni sistema de almacenamiento puede garantizar una seguridad completa.",
        ],
        rights: [
          "Tus derechos de privacidad",
          "Según dónde vivas y las leyes de privacidad que se apliquen, puedes tener derechos sobre la información personal procesada mediante AdashimaVerse. Estos pueden incluir el derecho a recibir información, acceder a tus datos, solicitar su corrección o eliminación, oponerte a determinados usos, solicitar su portabilidad o presentar una reclamación ante la autoridad de protección de datos correspondiente.",
          "Si has enviado comentarios y tienes una solicitud de privacidad relacionada con ellos, contacta con AdashimaVerse usando el método de contacto proporcionado en el sitio. Es posible que necesitemos información suficiente para verificar que la solicitud se refiere a ti.",
        ],
        children: [
          "Privacidad infantil",
          "AdashimaVerse es un sitio de fans dirigido al público general y no solicita intencionadamente información personal sensible a los visitantes. El formulario de comentarios no requiere una cuenta ni una dirección de correo electrónico.",
        ],
        external: [
          "Enlaces externos",
          "AdashimaVerse contiene enlaces a sitios web y servicios externos. Una vez que abandonas AdashimaVerse, se aplican las prácticas de privacidad del sitio de destino.",
        ],
        changes: [
          "Cambios en esta política",
          "Esta política de privacidad puede actualizarse cuando cambien las funciones, los servicios o las prácticas de tratamiento de datos del sitio web. La fecha anterior indica cuándo se revisó por última vez.",
        ],
        contact: [
          "Contacto",
          "Para preguntas o solicitudes de privacidad relacionadas con la información enviada mediante AdashimaVerse, utiliza el método de contacto proporcionado en el sitio web.",
          "AdashimaVerse es un proyecto de fans internacional, independiente y sin ánimo de lucro, y no está afiliado ni respaldado por los creadores, editores, licenciantes u otros titulares de derechos de Adachi to Shimamura.",
        ],
      },
    },
    en: null,
  },
  terms: {
    es: {
      title: "Términos y aviso legal",
      lead: "Una explicación clara de cómo AdashimaVerse gestiona la información, el contenido de fans y el propio sitio.",
      toc: [
        "Sobre AdashimaVerse",
        "Sin afiliación",
        "Propiedad intelectual",
        "Traducciones y comentarios de fans",
        "Exactitud",
        "Comentarios de usuarios",
        "Uso aceptable",
        "Solicitudes de derechos de autor",
      ],
      sections: {
        about: [
          "Sobre AdashimaVerse",
          "AdashimaVerse es un archivo internacional de fans, independiente y sin ánimo de lucro, dedicado a Adachi to Shimamura.",
          "El sitio existe para organizar, documentar, traducir, comentar y compartir información relacionada con la serie y sus medios asociados.",
        ],
        affiliation: [
          "Sin afiliación",
          "AdashimaVerse no está afiliado, gestionado, patrocinado ni respaldado por Hitoma Iruma, los editores, licenciantes, productoras de anime, compañías musicales u otros titulares oficiales de derechos asociados con Adachi to Shimamura.",
        ],
        ip: [
          "Propiedad intelectual",
          "AdashimaVerse no reclama la propiedad de Adachi to Shimamura, sus personajes, ilustraciones, música, publicaciones ni otros materiales protegidos que pertenezcan a sus respectivos titulares.",
          "El código, diseño, organización, comentarios, traducciones y demás materiales originales creados para el sitio pueden tener derechos independientes. Los derechos aplicables pueden variar según el material.",
        ],
        "fan-work": [
          "Traducciones y comentarios de fans",
          "Algunos materiales pueden consistir en traducciones, resúmenes, comentarios u otras obras transformativas creadas por fans. Se ofrecen con fines informativos y de archivo, y no deben considerarse una traducción o publicación oficial.",
          "Cuando exista una edición oficial localizada, se recomienda apoyar dicha edición oficial.",
        ],
        accuracy: [
          "Exactitud de la información",
          "Nos esforzamos razonablemente por mantener AdashimaVerse actualizado y preciso. Sin embargo, es un proyecto de fans y el sitio puede contener errores, omisiones, información desactualizada, diferencias de traducción o registros incompletos.",
          "Si encuentras un error, puedes informarlo mediante la función de comentarios del sitio.",
        ],
        external: [
          "Sitios web externos",
          "AdashimaVerse contiene enlaces a sitios y servicios operados por terceros, incluidas fuentes oficiales, editores, plataformas sociales, comunidades y otros recursos.",
          "AdashimaVerse no controla esos sitios y no es responsable de su contenido, disponibilidad, seguridad ni prácticas de privacidad.",
        ],
        feedback: [
          "Comentarios de usuarios",
          "Los visitantes pueden enviar voluntariamente comentarios, correcciones, sugerencias o informes de errores. Eres responsable de la información que decidas incluir.",
          "No envíes contraseñas, información de pago, credenciales privadas ni datos personales altamente sensibles.",
        ],
        use: [
          "Uso aceptable",
          "Aceptas no utilizar intencionadamente el sitio para interrumpirlo o dañarlo, intentar obtener acceso no autorizado, introducir código malicioso, abusar de sus funciones, enviar spam o envíos automatizados, ni interferir con el acceso de otros visitantes.",
        ],
        availability: [
          "Disponibilidad y cambios",
          "AdashimaVerse se proporciona según disponibilidad. Las páginas, los contenidos multimedia, los servicios externos o las funciones pueden dejar de estar disponibles, cambiar o eliminarse.",
          "El sitio puede actualizarse, rediseñarse, reorganizarse o discontinuarse en cualquier momento.",
        ],
        copyright: [
          "Derechos de autor y solicitudes de retirada",
          "Si eres titular de derechos de autor u otros derechos y consideras que un material de AdashimaVerse debe retirarse, corregirse o tratarse de otro modo, contacta con nosotros mediante el método indicado en el sitio web.",
          "Cuando sea apropiado, identifica el material, dónde aparece, tu relación con el titular, la acción solicitada y un medio fiable para contactarte. Revisaremos de buena fe las solicitudes legítimas.",
        ],
        disclaimer: [
          "Aviso legal",
          "En la medida permitida por la ley aplicable, AdashimaVerse no garantiza que el sitio o su información sean siempre completos, precisos, actuales, ininterrumpidos o libres de errores.",
          "Nada de estos términos pretende eliminar o limitar derechos o protecciones que legalmente no puedan excluirse.",
        ],
        changes: [
          "Cambios en estos términos",
          "Estos términos y aviso legal pueden actualizarse cuando cambien el sitio o sus prácticas. La fecha anterior indica cuándo se revisaron por última vez.",
        ],
      },
    },
    en: null,
  },
};

function currentLanguage() {
  try {
    return localStorage.getItem(LEGAL_LANGUAGE_KEY) === "en" ? "en" : LEGAL_DEFAULT_LANGUAGE;
  } catch {
    return LEGAL_DEFAULT_LANGUAGE;
  }
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

function translatePage(lang) {
  const page = location.pathname.toLowerCase().includes("terms") ? "terms" : "privacy";
  const common = COMMON[lang];
  if (lang === "en") {
    englishMarkup.forEach((markup, element) => {
      element.innerHTML = markup;
    });
    document.documentElement.lang = "en";
    document.title =
      page === "terms" ? "Terms & Disclaimer — AdashimaVerse" : "Privacy Policy — AdashimaVerse";
    document.querySelectorAll("[data-legal-lang]").forEach((button) => {
      const active = button.dataset.legalLang === "en";
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    return;
  }
  const content = CONTENT[page][lang] || CONTENT[page].es;
  const sections = [...document.querySelectorAll(".legal-section")];
  const sectionKeys =
    page === "privacy"
      ? [
          "collection",
          "feedback",
          "storage",
          "cookies",
          "third-party",
          "retention",
          "security",
          "rights",
          "children",
          "external",
          "changes",
          "contact",
        ]
      : [
          "about",
          "affiliation",
          "ip",
          "fan-work",
          "accuracy",
          "external",
          "feedback",
          "use",
          "availability",
          "copyright",
          "disclaimer",
          "changes",
        ];

  document.documentElement.lang = lang;
  document.title = `${content.title} — AdashimaVerse`;
  setText(".legal-back", common.back);
  setText(".legal-eyebrow", common.eyebrow);
  setText(".legal-updated", common.updated);
  setText(".legal-mobile-toc summary, .legal-toc-title", common.onPage);
  setText(".legal-footer a[href='/privacy']", common.privacy);
  setText(".legal-footer a[href='/terms']", common.terms);
  document.querySelector(".legal-hero h1").textContent = content.title;
  document.querySelector(".legal-lead").textContent = content.lead;

  sections.forEach((section, index) => {
    const values = content.sections[sectionKeys[index]];
    if (!values) return;
    const elements = [section.querySelector("h2"), ...section.querySelectorAll("p, li")].filter(
      Boolean,
    );
    values.forEach((value, valueIndex) => {
      if (elements[valueIndex]) elements[valueIndex].textContent = value;
    });
  });

  document.querySelectorAll(".legal-mobile-toc, .legal-toc").forEach((toc) => {
    toc.querySelectorAll("a").forEach((link, index) => {
      const value = content.toc[index];
      if (value) link.textContent = value;
    });
  });

  document.querySelectorAll("[data-legal-lang]").forEach((button) => {
    const active = button.dataset.legalLang === lang;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll(
      ".legal-hero h1, .legal-lead, .legal-updated, .legal-section h2, .legal-section p, .legal-section li, .legal-mobile-toc a, .legal-toc a",
    )
    .forEach((element) => {
      englishMarkup.set(element, element.innerHTML);
    });

  document.querySelectorAll("[data-legal-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      const lang = button.dataset.legalLang;
      try {
        localStorage.setItem(LEGAL_LANGUAGE_KEY, lang);
      } catch {
        // Keep the page usable when storage is unavailable.
      }
      document.dispatchEvent(new CustomEvent("languageChanged", { detail: { lang } }));
      translatePage(lang);
    });
  });

  translatePage(currentLanguage());
});
