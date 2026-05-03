import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const TRANSLATABLE_ATTRS = ['aria-label', 'placeholder', 'title'] as const;

type TranslationMap = Record<string, string>;

function translateText(value: string, translations: TranslationMap) {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const key = value.trim();
  const translated = translations[key];
  return translated ? `${leading}${translated}${trailing}` : value;
}

function shouldSkipTextNode(node: Text) {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(
    parent.closest(
      'script, style, textarea, input, [contenteditable="true"], [data-skip-zh-bridge="true"]'
    )
  );
}

export default function HardcodedChineseBridge() {
  const { i18n } = useTranslation();
  const originals = useRef(new WeakMap<Text, string>());

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return undefined;
    let cancelled = false;
    let observer: MutationObserver | null = null;

    const restore = () => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        const original = originals.current.get(node);
        if (original !== undefined) {
          node.nodeValue = original;
          originals.current.delete(node);
        }
        node = walker.nextNode() as Text | null;
      }

      root.querySelectorAll<HTMLElement>('[data-zh-attrs]').forEach((el) => {
        const attrs = (el.dataset.zhAttrs ?? '').split(',').filter(Boolean);
        attrs.forEach((attr) => {
          const original = el.dataset[`zhOriginal${attr.replace(/[^a-zA-Z0-9]/g, '')}`];
          if (original !== undefined) {
            el.setAttribute(attr, original);
            delete el.dataset[`zhOriginal${attr.replace(/[^a-zA-Z0-9]/g, '')}`];
          }
        });
        delete el.dataset.zhAttrs;
      });
    };

    const translate = (translations: TranslationMap) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        if (!shouldSkipTextNode(node) && node.nodeValue) {
          const nextValue = translateText(
            originals.current.get(node) ?? node.nodeValue,
            translations
          );
          if (nextValue !== node.nodeValue) {
            if (!originals.current.has(node)) originals.current.set(node, node.nodeValue);
            node.nodeValue = nextValue;
          }
        }
        node = walker.nextNode() as Text | null;
      }

      root
        .querySelectorAll<HTMLElement>(TRANSLATABLE_ATTRS.map((attr) => `[${attr}]`).join(','))
        .forEach((el) => {
          if (el.closest('[data-skip-zh-bridge="true"]')) return;
          const changedAttrs = new Set((el.dataset.zhAttrs ?? '').split(',').filter(Boolean));
          TRANSLATABLE_ATTRS.forEach((attr) => {
            const value = el.getAttribute(attr);
            if (!value) return;
            const translated = translateText(value, translations);
            if (translated === value) return;
            const dataKey = `zhOriginal${attr.replace(/[^a-zA-Z0-9]/g, '')}`;
            if (el.dataset[dataKey] === undefined) el.dataset[dataKey] = value;
            el.setAttribute(attr, translated);
            changedAttrs.add(attr);
          });
          if (changedAttrs.size > 0) el.dataset.zhAttrs = Array.from(changedAttrs).join(',');
        });
    };

    restore();
    if (i18n.language !== 'zh') return undefined;

    void import('../i18n/hardcodedZh').then(({ hardcodedZh }) => {
      if (cancelled) return;
      translate(hardcodedZh);
      observer = new MutationObserver(() => translate(hardcodedZh));
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: [...TRANSLATABLE_ATTRS],
      });
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      restore();
    };
  }, [i18n.language]);

  return null;
}
