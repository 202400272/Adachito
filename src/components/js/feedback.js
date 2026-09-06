import { FEEDBACK_CONFIG } from "../config/feedback-config.js";

const FEEDBACK_TRANSLATIONS = {
  es: {
    selectType: "Selecciona un tipo de comentario.",
    enterTitle: "Introduce un título.",
    titleLimit: "El título debe tener 100 caracteres o menos.",
    enterDescription: "Introduce una descripción.",
    descriptionLimit: "La descripción debe tener 3000 caracteres o menos.",
    blocked: "Envío bloqueado. Inténtalo de nuevo.",
    sendFailed: "No se pudieron enviar los comentarios. Inténtalo de nuevo.",
  },
  en: {
    selectType: "Please select a feedback type.",
    enterTitle: "Please enter a title.",
    titleLimit: "Title must be 100 characters or less.",
    enterDescription: "Please enter a description.",
    descriptionLimit: "Description must be 3000 characters or less.",
    blocked: "Submission blocked. Please try again.",
    sendFailed: "Failed to send feedback. Please try again.",
  },
  tg: {
    selectType: "Pumili ng uri ng feedback.",
    enterTitle: "Maglagay ng pamagat.",
    titleLimit: "Dapat ay 100 character o mas kaunti ang pamagat.",
    enterDescription: "Maglagay ng paglalarawan.",
    descriptionLimit: "Dapat ay 3000 character o mas kaunti ang paglalarawan.",
    blocked: "Na-block ang pagpapadala. Subukan muli.",
    sendFailed: "Hindi naipadala ang feedback. Subukan muli.",
  },
};

class FeedbackManager {
  constructor() {
    this.isSending = false;
    this.modal = null;
    this.form = null;
    this.successEl = null;
    this.submitBtn = null;
    this.cancelBtn = null;
    this.closeBtn = null;
    this.overlay = null;
    this.focusableElements = [];
    this.firstFocusable = null;
    this.lastFocusable = null;
    this.previouslyFocused = null;

    document.addEventListener("languageChanged", (event) => {
      this.applyTranslation(event.detail?.lang);
    });

    // Initialize EmailJS
    this.initEmailJS();
  }

  initEmailJS() {
    // Load EmailJS from CDN if not already loaded
    if (typeof emailjs === "undefined") {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
      script.onload = () => {
        emailjs.init(FEEDBACK_CONFIG.PUBLIC_KEY);
        console.log("[Feedback] EmailJS initialized");
      };
      document.head.appendChild(script);
    } else {
      emailjs.init(FEEDBACK_CONFIG.PUBLIC_KEY);
    }
  }

  init() {
    // Create modal if it doesn't exist
    if (!document.getElementById("feedbackModal")) {
      this.injectModal();
      // injectModal() fetches the modal HTML and calls init() again once
      // it's in the DOM — nothing below this can run yet.
      return;
    }

    this.modal = document.getElementById("feedbackModal");
    this.form = document.getElementById("feedbackForm");
    this.successEl = document.getElementById("feedbackSuccess");
    this.submitBtn = document.getElementById("feedbackSubmit");
    this.cancelBtn = document.getElementById("feedbackCancel");
    this.closeBtn = document.getElementById("feedbackClose");
    this.overlay = this.modal.querySelector(".feedback-overlay");

    this.applyTranslation();
    document.dispatchEvent(new CustomEvent("feedbackModalReady"));

    // Bind events
    this.bindEvents();

    // Add feedback button to footer. The footer itself may still be
    // loading asynchronously (src/components/js/footer.js fetches it in),
    // so wire up immediately if it's already there, and also listen for
    // the footerLoaded event in case it lands after this runs.
    this.addFooterButton();
    document.addEventListener("footerLoaded", () => this.addFooterButton());
  }

  injectModal() {
    // Load modal HTML (absolute path so this works from any page depth)
    fetch("/src/components/feedback.html")
      .then((res) => res.text())
      .then((html) => {
        const container = document.createElement("div");
        container.innerHTML = html;
        document.body.appendChild(container.firstElementChild);
        // Re-initialize after injection
        this.init();
      })
      .catch((err) => {
        console.error("[Feedback] Failed to load modal:", err);
        // Fallback: create minimal modal
        this.createFallbackModal();
      });
  }

  createFallbackModal() {
    // Minimal fallback modal
    const modalHTML = `
      <div id="feedbackModal" class="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedbackTitle" style="display:none;">
        <div class="feedback-overlay"></div>
        <div class="feedback-container glass-box">
          <button class="feedback-close" id="feedbackClose" aria-label="Close feedback form"><i class="fas fa-times"></i></button>
          <div class="feedback-header">
            <h2 id="feedbackTitle">Send Feedback</h2>
            <p class="feedback-subtitle">Found a bug, typo, missing content, or have a suggestion? I'd love to hear from you.</p>
          </div>
          <form id="feedbackForm" novalidate>
            <div class="honeypot" style="position:absolute;left:-9999px;top:-9999px;">
              <label for="honeypotField">Leave this field empty</label>
              <input type="text" id="honeypotField" name="honeypot" tabindex="-1" autocomplete="off">
            </div>
            <div class="feedback-field">
              <label for="feedbackType">Feedback Type <span class="required">*</span></label>
              <select id="feedbackType" name="feedbackType" required>
                <option value="">Select a type...</option>
                <option value="bug">🐞 Bug Report</option>
                <option value="translation">📝 Translation Correction</option>
                <option value="missing">📚 Missing Content</option>
                <option value="broken">🔗 Broken Link</option>
                <option value="feature">💡 Feature Request</option>
                <option value="general">⭐ General Feedback</option>
              </select>
              <span class="field-error" id="feedbackTypeError"></span>
            </div>
            <div class="feedback-field">
              <label for="feedbackTitleInput">Title <span class="required">*</span></label>
              <input type="text" id="feedbackTitleInput" name="feedbackTitle" placeholder="Brief summary of your feedback" maxlength="100" required>
              <div class="char-counter"><span id="titleCount">0</span>/100</div>
              <span class="field-error" id="feedbackTitleError"></span>
            </div>
            <div class="feedback-field">
              <label for="feedbackDescription">Description <span class="required">*</span></label>
              <textarea id="feedbackDescription" name="feedbackDescription" placeholder="Please provide details about your feedback..." maxlength="3000" rows="6" required></textarea>
              <div class="char-counter"><span id="descCount">0</span>/3000</div>
              <span class="field-error" id="feedbackDescriptionError"></span>
            </div>
            <div class="feedback-field">
              <label for="feedbackEmail">Email <span class="optional">(optional)</span></label>
              <input type="email" id="feedbackEmail" name="feedbackEmail" placeholder="your@email.com">
              <span class="field-hint">We'll only use this to follow up if needed.</span>
            </div>
            <div class="feedback-actions">
              <button type="button" class="feedback-cancel" id="feedbackCancel">Cancel</button>
              <button type="submit" class="feedback-submit" id="feedbackSubmit">
                <span class="submit-text">Send Feedback</span>
                <span class="submit-spinner" style="display:none;"><i class="fas fa-spinner fa-spin"></i> Sending...</span>
              </button>
            </div>
          </form>
          <div class="feedback-success" id="feedbackSuccess" style="display:none;">
            <div class="success-icon">✓</div>
            <h3>Thank You!</h3>
            <p>Your feedback has been sent successfully.</p>
          </div>
        </div>
      </div>
    `;
    const container = document.createElement("div");
    container.innerHTML = modalHTML;
    document.body.appendChild(container.firstElementChild);
    this.init();
  }

  getLanguage() {
    const language = window.LanguageSwitch?.getCurrentLanguage?.();
    if (FEEDBACK_TRANSLATIONS[language]) return language;

    const documentLanguage = document.documentElement?.lang;
    if (FEEDBACK_TRANSLATIONS[documentLanguage]) return documentLanguage;

    return "es";
  }

  applyTranslation(language = this.getLanguage()) {
    if (!this.modal || !FEEDBACK_TRANSLATIONS[language]) return;

    this.modal.querySelectorAll("[data-es], [data-en], [data-tg]").forEach((element) => {
      const translated = element.getAttribute(`data-${language}`);
      if (translated !== null) element.innerHTML = translated;
    });

    this.modal
      .querySelectorAll("[data-es-placeholder], [data-en-placeholder], [data-tg-placeholder]")
      .forEach((element) => {
        const translated = element.getAttribute(`data-${language}-placeholder`);
        if (translated !== null) element.setAttribute("placeholder", translated);
      });

    Array.from(
      this.modal.querySelectorAll(
        "[data-es-aria-label], [data-en-aria-label], [data-tg-aria-label]",
      ),
    ).forEach((element) => {
      const translated = element.getAttribute(`data-${language}-aria-label`);
      if (translated !== null) element.setAttribute("aria-label", translated);
    });
  }

  translate(key) {
    const language = this.getLanguage();
    return FEEDBACK_TRANSLATIONS[language][key] || FEEDBACK_TRANSLATIONS.es[key];
  }

  addFooterButton() {
    const footer = document.getElementById("footer");
    if (!footer) return;

    // If the footer markup already ships its own feedback button (e.g. the
    // standard site footer), just wire it up instead of adding a duplicate.
    const existingBtn = footer.querySelector(".feedback-footer-btn");
    if (existingBtn) {
      existingBtn.addEventListener("click", () => this.openModal());
      return;
    }

    const btn = document.createElement("button");
    btn.className = "feedback-footer-btn";
    btn.innerHTML = "💬 Send Feedback";
    btn.setAttribute("aria-label", "Open feedback form");
    btn.style.cssText = `
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      padding: 0.6rem 1.2rem;
      color: rgba(255,255,255,0.7);
      font-family: 'Inter', sans-serif;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-top: 0.75rem;
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(255,255,255,0.15)";
      btn.style.color = "#fff";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "rgba(255,255,255,0.08)";
      btn.style.color = "rgba(255,255,255,0.7)";
    });

    btn.addEventListener("click", () => this.openModal());
    footer.appendChild(btn);
  }

  bindEvents() {
    // Open/Close
    this.cancelBtn?.addEventListener("click", () => this.closeModal());
    this.closeBtn?.addEventListener("click", () => this.closeModal());
    this.overlay?.addEventListener("click", () => this.closeModal());

    // Keyboard: Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen()) {
        this.closeModal();
      }
    });

    // Keyboard: Tab trapping
    this.modal?.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        this.trapFocus(e);
      }
    });

    // Character counters
    const titleInput = document.getElementById("feedbackTitleInput");
    const descInput = document.getElementById("feedbackDescription");

    titleInput?.addEventListener("input", () => {
      this.updateCharCounter("titleCount", titleInput.value.length, 100);
    });

    descInput?.addEventListener("input", () => {
      this.updateCharCounter("descCount", descInput.value.length, 3000);
    });

    // Form submit
    this.form?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Real-time validation feedback
    const fields = ["feedbackType", "feedbackTitleInput", "feedbackDescription"];
    fields.forEach((id) => {
      const el = document.getElementById(id);
      el?.addEventListener("blur", () => this.validateField(id));
      el?.addEventListener("input", () => {
        const errorEl = document.getElementById(`${id}Error`);
        if (errorEl) errorEl.textContent = "";
        el.closest(".feedback-field")?.classList.remove("has-error");
      });
    });
  }

  updateCharCounter(elementId, count, max) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = count;
    const parent = el.closest(".char-counter");
    if (parent) {
      parent.classList.toggle("over-limit", count > max);
    }
  }

  validateField(fieldId) {
    const el = document.getElementById(fieldId);
    const errorEl = document.getElementById(`${fieldId}Error`);
    if (!el || !errorEl) return true;

    const value = el.value.trim();
    let isValid = true;
    let message = "";

    switch (fieldId) {
      case "feedbackType":
        if (!value) {
          message = this.translate("selectType");
          isValid = false;
        }
        break;
      case "feedbackTitleInput":
        if (!value) {
          message = this.translate("enterTitle");
          isValid = false;
        } else if (value.length > 100) {
          message = this.translate("titleLimit");
          isValid = false;
        }
        break;
      case "feedbackDescription":
        if (!value) {
          message = this.translate("enterDescription");
          isValid = false;
        } else if (value.length > 3000) {
          message = this.translate("descriptionLimit");
          isValid = false;
        }
        break;
    }

    errorEl.textContent = message;
    el.closest(".feedback-field")?.classList.toggle("has-error", !isValid);
    return isValid;
  }

  validateForm() {
    const fields = ["feedbackType", "feedbackTitleInput", "feedbackDescription"];
    let allValid = true;
    fields.forEach((id) => {
      if (!this.validateField(id)) allValid = false;
    });
    return allValid;
  }

  async handleSubmit() {
    if (this.isSending) return;

    // Honeypot check
    const honeypot = document.getElementById("honeypotField");
    if (honeypot && honeypot.value.length > 0) {
      console.warn("[Feedback] Honeypot triggered — submission blocked");
      this.showError(this.translate("blocked"));
      return;
    }

    // Validate
    if (!this.validateForm()) {
      // Focus first invalid field
      const firstError = this.form.querySelector(
        ".has-error input, .has-error select, .has-error textarea",
      );
      if (firstError) firstError.focus();
      return;
    }

    this.isSending = true;
    this.setSubmitState(true);

    try {
      const formData = this.gatherFormData();
      const metadata = FEEDBACK_CONFIG.getMetadata();

      // Prepare template params
      const templateParams = {
        feedback_type: formData.type,
        feedback_title: formData.title,
        feedback_description: formData.description,
        feedback_email: formData.email || "Not provided",
        // Metadata
        page_url: metadata.url,
        page_title: metadata.pageTitle,
        website_version: metadata.version,
        browser: metadata.browser,
        operating_system: metadata.os,
        screen_resolution: metadata.screenResolution,
        viewport: metadata.viewport,
        language: metadata.language,
        timezone: metadata.timezone,
        timestamp: metadata.timestamp,
        user_agent: metadata.userAgent,
      };

      // Send via EmailJS
      const response = await emailjs.send(
        FEEDBACK_CONFIG.SERVICE_ID,
        FEEDBACK_CONFIG.TEMPLATE_ID,
        templateParams,
      );

      console.log("[Feedback] Sent successfully:", response);
      this.showSuccess();
    } catch (error) {
      console.error("[Feedback] Send failed:", error);
      this.showError(this.translate("sendFailed"));
      this.setSubmitState(false);
      this.isSending = false;
    }
  }

  gatherFormData() {
    return {
      type: document.getElementById("feedbackType")?.value || "",
      title: document.getElementById("feedbackTitleInput")?.value.trim() || "",
      description: document.getElementById("feedbackDescription")?.value.trim() || "",
      email: document.getElementById("feedbackEmail")?.value.trim() || "",
    };
  }

  setSubmitState(sending) {
    if (!this.submitBtn) return;
    const textSpan = this.submitBtn.querySelector(".submit-text");
    const spinnerSpan = this.submitBtn.querySelector(".submit-spinner");

    if (sending) {
      this.submitBtn.disabled = true;
      if (textSpan) textSpan.style.display = "none";
      if (spinnerSpan) spinnerSpan.style.display = "inline";
    } else {
      this.submitBtn.disabled = false;
      if (textSpan) textSpan.style.display = "inline";
      if (spinnerSpan) spinnerSpan.style.display = "none";
    }
  }

  showSuccess() {
    if (this.form) this.form.style.display = "none";
    if (this.successEl) {
      this.successEl.style.display = "block";
      // Clear form data
      this.form?.reset();
      const titleCount = document.getElementById("titleCount");
      const descCount = document.getElementById("descCount");
      if (titleCount) titleCount.textContent = "0";
      if (descCount) descCount.textContent = "0";
    }

    // Close after 2 seconds
    setTimeout(() => {
      this.closeModal();
    }, 2000);
  }

  showError(message) {
    // Show error at top of form
    const errorContainer = this.form?.querySelector(".feedback-field:first-child");
    if (errorContainer) {
      // Remove existing error
      const existing = errorContainer.querySelector(".form-error-message");
      if (existing) existing.remove();

      const errorMsg = document.createElement("span");
      errorMsg.className = "form-error-message field-error";
      errorMsg.textContent = "❌ " + message;
      errorContainer.parentNode?.insertBefore(errorMsg, errorContainer.nextSibling);

      // Auto-remove after 5 seconds
      setTimeout(() => errorMsg.remove(), 5000);
    }
  }

  openModal() {
    if (!this.modal) return;
    this.previouslyFocused = document.activeElement;

    this.modal.style.display = "flex";
    document.body.style.overflow = "hidden";

    // Reset form
    this.form?.reset();
    if (this.form) this.form.style.display = "block";
    if (this.successEl) this.successEl.style.display = "none";
    this.setSubmitState(false);
    this.isSending = false;

    // Clear errors
    document.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
    document.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));
    document.querySelectorAll(".form-error-message").forEach((el) => el.remove());

    // Focus first input
    setTimeout(() => {
      const firstInput = this.modal.querySelector('select, input:not([type="hidden"]), textarea');
      if (firstInput) firstInput.focus();
    }, 100);

    this.updateFocusableElements();
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.style.display = "none";
    document.body.style.overflow = "";

    // Restore focus
    if (this.previouslyFocused) {
      this.previouslyFocused.focus();
    }
  }

  isOpen() {
    return this.modal && this.modal.style.display === "flex";
  }

  updateFocusableElements() {
    if (!this.modal) return;
    this.focusableElements = this.modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    this.firstFocusable = this.focusableElements[0];
    this.lastFocusable = this.focusableElements[this.focusableElements.length - 1];
  }

  trapFocus(e) {
    if (!this.isOpen()) return;

    const isTab = e.key === "Tab";
    if (!isTab) return;

    const isShift = e.shiftKey;

    // If focus is on last element and tab forward, wrap to first
    if (!isShift && document.activeElement === this.lastFocusable) {
      e.preventDefault();
      this.firstFocusable?.focus();
    }

    // If focus is on first element and tab backward, wrap to last
    if (isShift && document.activeElement === this.firstFocusable) {
      e.preventDefault();
      this.lastFocusable?.focus();
    }
  }
}

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const feedback = new FeedbackManager();
  feedback.init();

  // Expose for debugging if needed
  window.__feedback = feedback;
});

export default FeedbackManager;
