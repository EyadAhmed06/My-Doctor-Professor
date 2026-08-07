"use client";

import { FiGlobe } from "react-icons/fi";
import { LanguageSwitcher, useLocale } from "./locale-provider";

export function GlobalLanguageAccess(){
  const {locale}=useLocale();
  return <aside className="global-language-access" aria-label={locale==="ar"?"تغيير اللغة":"Change language"}><FiGlobe/><LanguageSwitcher compact/></aside>;
}
