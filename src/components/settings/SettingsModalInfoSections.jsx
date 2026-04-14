import React from "react";

import { Icon } from "../Icon.jsx";

export function TermsSettingsPanel({ legalSections, locale, termsReviewDate }) {
  return (
    <div className="settings-stack">
      <section className="settings-card settings-legal-hero">
        <div className="settings-card-title">
          <h3>{locale.terms.title}</h3>
          <span>{locale.terms.subtitle}</span>
        </div>

        <div className="settings-legal-summary">
          <div className="settings-legal-summary-copy">
            <strong>{locale.terms.summaryTitle}</strong>
            <p>{locale.terms.summaryBody}</p>
          </div>
          <div className="settings-legal-summary-note">
            <strong>{locale.terms.lastReview}</strong>
            <span>{termsReviewDate}</span>
          </div>
        </div>

        <div className="settings-legal-pill-row">
          {locale.terms.pills.map((pill) => (
            <span className="user-profile-chip" key={pill}>
              {pill}
            </span>
          ))}
        </div>
      </section>

      <section className="settings-card settings-legal-card">
        <div className="settings-card-title">
          <h3>{locale.terms.conditionsTitle}</h3>
          <span>{locale.terms.conditionsSubtitle}</span>
        </div>

        <div className="settings-legal-section-list">
          {legalSections.map((section) => (
            <article className="settings-legal-section" key={section.id}>
              <div className="settings-legal-section-header">
                <span className="settings-row-icon">
                  <Icon name="help" size={16} />
                </span>
                <strong>{section.title}</strong>
              </div>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-card settings-legal-card">
        <div className="settings-card-title">
          <h3>{locale.terms.acceptTitle}</h3>
          <span>{locale.terms.acceptSubtitle}</span>
        </div>

        <ul className="settings-legal-checklist">
          {locale.terms.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="settings-card settings-legal-card">
        <div className="settings-card-title">
          <h3>{locale.terms.supportTitle}</h3>
          <span>{locale.terms.supportSubtitle}</span>
        </div>

        <div className="settings-empty-state settings-empty-state-solid">
          <strong>{locale.terms.recommendation}</strong>
          <span>{locale.terms.recommendationBody}</span>
        </div>
      </section>
    </div>
  );
}

export function CreditsSettingsPanel({ locale }) {
  const credits = locale.credits;

  return (
    <div className="settings-stack">
      <section className="settings-card settings-legal-hero settings-credits-hero">
        <div className="settings-card-title">
          <h3>{credits.title}</h3>
          <span>{credits.subtitle}</span>
        </div>

        <div className="settings-legal-summary">
          <div className="settings-legal-summary-copy">
            <strong>{credits.companyTitle}</strong>
            <p>{credits.companyBody}</p>
          </div>
          <div className="settings-legal-summary-note">
            <strong>{credits.companyTag}</strong>
            <span>mia S.S</span>
          </div>
        </div>
      </section>

      <section className="settings-card settings-legal-card">
        <div className="settings-card-title">
          <h3>{credits.executiveTitle}</h3>
          <span>{credits.noteTitle}</span>
        </div>

        <div className="settings-credits-grid">
          <article className="settings-credits-person-card">
            <span className="settings-row-icon">
              <Icon name="profile" size={16} />
            </span>
            <strong>{credits.people.ceoName}</strong>
            <span>{credits.people.ceoRole}</span>
          </article>

          <article className="settings-credits-person-card">
            <span className="settings-row-icon">
              <Icon name="sparkles" size={16} />
            </span>
            <strong>{credits.people.engineerNames}</strong>
            <span>{credits.people.engineerRole}</span>
          </article>

          <article className="settings-credits-person-card">
            <span className="settings-row-icon">
              <Icon name="community" size={16} />
            </span>
            <strong>{credits.people.adminName}</strong>
            <span>{credits.people.adminRole}</span>
          </article>
        </div>

        <div className="settings-empty-state settings-empty-state-solid">
          <strong>{credits.noteTitle}</strong>
          <span>{credits.noteBody}</span>
        </div>
      </section>
    </div>
  );
}

export function LanguageSettingsPanel({
  activeLanguageOption,
  language,
  languageOptions,
  locale,
  onChangeLanguage
}) {
  const languageLocale = locale?.language || {
    applyNow: "Aplicado al instante",
    current: "Idioma actual",
    currentHelper: "Elige el idioma visible de Umbra en este dispositivo.",
    note: "Mas areas de Umbra heredaran este idioma gradualmente.",
    preview: "Vista rapida",
    previewBody: "Cambia entre idiomas disponibles sin salir de ajustes.",
    selected: "Seleccionado",
    subtitle: "Ajusta el idioma visible de Umbra para esta app y este dispositivo.",
    title: "Idiomas"
  };
  const resolvedLanguageOptions =
    Array.isArray(languageOptions) && languageOptions.length
      ? languageOptions
      : [
          {
            helper: "Idioma base de Umbra.",
            label: "EspaÃ±ol",
            nativeLabel: "EspaÃ±ol",
            value: "es"
          }
        ];
  const resolvedActiveLanguageOption =
    activeLanguageOption ||
    resolvedLanguageOptions.find((option) => option.value === language) ||
    resolvedLanguageOptions[0] || {
      helper: "",
      label: language || "es",
      nativeLabel: language || "es",
      value: language || "es"
    };

  return (
    <div className="settings-stack">
      <section className="settings-card settings-legal-hero">
        <div className="settings-card-title">
          <h3>{languageLocale.title}</h3>
          <span>{languageLocale.subtitle}</span>
        </div>

        <div className="settings-legal-summary">
          <div className="settings-legal-summary-copy">
            <strong>{languageLocale.current}</strong>
            <p>{languageLocale.currentHelper}</p>
          </div>
          <div className="settings-legal-summary-note">
            <strong>{resolvedActiveLanguageOption.nativeLabel}</strong>
            <span>{languageLocale.applyNow}</span>
          </div>
        </div>
      </section>

      <section className="settings-card settings-language-grid-card">
        <div className="settings-card-title">
          <h3>{languageLocale.preview}</h3>
          <span>{languageLocale.previewBody}</span>
        </div>

        <div className="settings-language-grid">
          {resolvedLanguageOptions.map((option) => {
            const selected = option.value === language;
            return (
              <button
                className={`settings-language-option ${selected ? "active" : ""}`.trim()}
                key={option.value}
                onClick={() => onChangeLanguage?.(option.value)}
                type="button"
              >
                <div className="settings-language-option-copy">
                  <strong>{option.nativeLabel}</strong>
                  <span>{option.helper}</span>
                </div>
                <span className={`user-profile-chip ${selected ? "" : "muted"}`}>
                  {selected ? languageLocale.selected : option.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="settings-empty-state settings-empty-state-solid">
          <strong>{languageLocale.title}</strong>
          <span>{languageLocale.note}</span>
        </div>
      </section>
    </div>
  );
}
