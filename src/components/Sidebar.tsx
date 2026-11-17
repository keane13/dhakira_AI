import { useEffect, useRef, useState } from 'react';
import { NAV, useApp, type NavGroup, type PageId } from '../store';
import { Icon } from './icons';
import { LogoMark, Wordmark } from './brand';
import { LANGS } from '../i18n';
import type { Lang } from '../engine/types';

const COMPACT_KEY = 'dhakira:navCompact';
/** Short labels fit the panel. Each button keeps the full language name as its accessible name. */
const SHORT_LANG: Record<Lang, string> = { en: 'EN', ar: 'عربي', id: 'ID' };

function readCompact(): boolean {
  try {
    return localStorage.getItem(COMPACT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * A floating panel with icon-led items. Patient pages sit under one "Patient"
 * group that names the current patient, and programme pages under another, so
 * the menu shows three headings instead of nine links. Compact mode keeps only
 * the icons, each with its accessible name and a tooltip.
 */
export function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const { t, tx, page, go, session, setSession, currentCase, resetAll, lang, setLang, serverMode, syncState } = useApp();
  const notice = t('Fictional patients. Identifies risk, does not diagnose.', 'مرضى خياليون. يحدد الخطر ولا يشخّص.');
  const [compact, setCompact] = useState(readCompact);
  const groupOf = (p: PageId) => NAV.find((g) => g.items.some((i) => i.id === p))?.key;
  const [open, setOpen] = useState<Record<string, boolean>>({ patient: true, programme: groupOf(page) === 'programme' });
  const firstItem = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const g = groupOf(page);
    if (g && g !== 'queue') setOpen((o) => ({ ...o, [g]: true }));
  }, [page]);

  useEffect(() => {
    try { localStorage.setItem(COMPACT_KEY, compact ? '1' : '0'); } catch { /* the preference is optional */ }
  }, [compact]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    firstItem.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseMobile(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

  // On a phone the drawer always shows labels, whatever the desktop preference.
  const iconOnly = compact && !mobileOpen;
  const roleLabel = session?.role === 'doctor' ? t('Doctor', 'طبيب') : t('Nurse', 'ممرض');
  const navigate = (id: PageId) => { go(id); onCloseMobile(); };

  const renderGroup = (g: NavGroup, gi: number) => {
    const isOpen = iconOnly || !g.label || open[g.key];
    const panelId = `nav-${g.key}`;
    return (
      <div key={g.key} className="nav-group">
        {g.label && g.icon && !iconOnly && (
          <button
            type="button" className="nav-head" aria-expanded={isOpen} aria-controls={panelId}
            onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
          >
            <Icon name={g.icon} size={18} />
            <span className="nav-head-text">
              <span>{tx(g.label)}</span>
              {g.key === 'patient' && <span className="nav-sub">{currentCase.name}, <span className="num">{currentCase.age}</span></span>}
            </span>
            <Icon name="chevron" size={16} className={`nav-chevron ${isOpen ? 'is-open' : ''}`} />
          </button>
        )}
        {iconOnly && g.label && gi > 0 && <span className="nav-divider" aria-hidden="true" />}
        {isOpen && (
          <div id={panelId} className={`nav-items ${g.label && !iconOnly ? 'is-nested' : ''}`}>
            {g.items.map((item, ii) => (
              <button
                key={item.id}
                ref={gi === 0 && ii === 0 ? firstItem : undefined}
                type="button"
                className="nav-item"
                aria-current={item.id === page ? 'page' : undefined}
                aria-label={iconOnly ? tx(item.label) : undefined}
                title={iconOnly ? tx(item.label) : undefined}
                onClick={() => navigate(item.id)}
              >
                <Icon name={item.icon} size={19} />
                {!iconOnly && <span>{tx(item.label)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {mobileOpen && <div className="nav-scrim" onClick={onCloseMobile} aria-hidden="true" />}
      <aside className={`rail ${iconOnly ? 'is-compact' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`} aria-label={t('Main menu', 'القائمة الرئيسية', 'Menu utama')}>
        <div className="rail-top">
          {iconOnly ? <LogoMark size={30} /> : <Wordmark />}
          <button
            type="button" className="icon-btn rail-collapse"
            aria-label={iconOnly ? t('Expand the menu', 'توسيع القائمة', 'Perluas menu') : t('Collapse the menu to icons', 'تصغير القائمة إلى أيقونات', 'Ciutkan menu menjadi ikon')}
            title={iconOnly ? t('Expand the menu', 'توسيع القائمة', 'Perluas menu') : t('Collapse the menu to icons', 'تصغير القائمة إلى أيقونات', 'Ciutkan menu menjadi ikon')}
            onClick={() => setCompact(!compact)}
          >
            <Icon name="collapse" size={18} className={iconOnly ? 'flip' : ''} />
          </button>
          <button type="button" className="icon-btn rail-close" aria-label={t('Close the menu', 'إغلاق القائمة', 'Tutup menu')} onClick={onCloseMobile}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <nav className="nav" aria-label={t('Pages', 'الصفحات', 'Halaman')}>
          {NAV.map(renderGroup)}
        </nav>
        <div className="rail-foot">
          {iconOnly
            ? <span className="tag tag-hold" title={notice} aria-label={notice}>!</span>
            : <p className="rail-notice">{notice}</p>}
          <div className="rail-lang" role="group" aria-label={t('Interface language', 'لغة الواجهة', 'Bahasa antarmuka')}>
            {LANGS.map((l) => (
              <button key={l.code} type="button" lang={l.code} aria-pressed={lang === l.code} aria-label={l.label} title={l.label} onClick={() => setLang(l.code)}>{SHORT_LANG[l.code]}</button>
            ))}
          </div>
          <button
            type="button" className="icon-btn rail-tour"
            onClick={() => { onCloseMobile(); window.dispatchEvent(new Event('dhakira:tour')); }}
            aria-label={t('Demo walkthrough', 'جولة العرض')} title={iconOnly ? t('Demo walkthrough', 'جولة العرض') : undefined}
          >
            <Icon name="play" size={18} />{!iconOnly && <span>{t('Demo walkthrough', 'جولة العرض')}</span>}
          </button>
          {!iconOnly && (
            <p className="tiny muted" role="status">{serverMode
              ? (syncState === 'error'
                ? t('Server unreachable: showing the last loaded records', 'تعذر الوصول إلى الخادم: تُعرض آخر السجلات المحمّلة', 'Server tidak terjangkau: menampilkan rekam terakhir yang dimuat')
                : t('Records saved on the server', 'السجلات محفوظة على الخادم', 'Rekam tersimpan di server'))
              : t('Records saved in this browser', 'السجلات محفوظة في هذا المتصفح', 'Rekam tersimpan di browser ini')}</p>
          )}
          <div className="user-line" title={iconOnly ? `${session?.name} · ${roleLabel}` : undefined}>
            <span className="avatar" aria-hidden="true">{session?.name.replace(/^(Dr|Nurse)\s+/, '')[0]}</span>
            {!iconOnly && (
              <div className="grow">
                <div className="small strong">{session?.name}</div>
                <div className="tiny muted">{roleLabel}{session?.facility ? ` · ${session.facility}` : ''}</div>
              </div>
            )}
          </div>
          <div className="rail-actions">
            <button type="button" className="icon-btn" onClick={() => setSession(null)} aria-label={t('Sign out', 'تسجيل الخروج')} title={t('Sign out', 'تسجيل الخروج')}>
              <Icon name="signout" size={18} />{!iconOnly && <span>{t('Sign out', 'تسجيل الخروج')}</span>}
            </button>
            <button type="button" className="icon-btn" onClick={resetAll} aria-label={t('Reset demo data', 'إعادة ضبط البيانات')} title={t('Reset demo data', 'إعادة ضبط البيانات')}>
              <Icon name="reset" size={18} />{!iconOnly && <span>{t('Reset', 'إعادة ضبط', 'Reset')}</span>}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
