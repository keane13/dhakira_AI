import { useId, useState, type FormEvent } from 'react';
import { demoSession, registerAny, signInAny, type AuthError } from '../auth';
import { API_MODE } from '../api';
import type { ClinicalRole } from '../engine/types';
import { useApp } from '../store';
import { BrainTrendArt, Wordmark } from '../components/brand';
import { LanguageSwitch } from '../components/ui';

export function Login() {
  const { t, setSession } = useApp();
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const panelId = useId();
  const errorText = useErrorText();
  const [demoError, setDemoError] = useState<AuthError | null>(null);
  const startDemo = async (role: ClinicalRole) => {
    setDemoError(null);
    const res = await demoSession(role);
    if ('session' in res) setSession(res.session);
    else setDemoError(res.error);
  };

  return (
    <div className="login">
      <section className="login-story">
        <Wordmark onDark />
        <h1>{t('Brain health review for clinicians', 'مراجعة صحة الدماغ للأطباء والممرضين')}</h1>
        <p className="lede">{t(
          'See meaningful cognitive and functional change over time, in the patient\'s language, with their health context beside it. The care decision stays with you.',
          'اطّلع على التغيّر الإدراكي والوظيفي المهم عبر الزمن، بلغة المريض، مع سياقه الصحي بجانبه. يبقى قرار الرعاية بيدك.',
        )}</p>
        <BrainTrendArt />
        <dl className="roles">
          <dt>{t('Nurses', 'الممرضون')}</dt>
          <dd>{t('Give the check, record the context and prepare the review.', 'يجرون الفحص ويسجلون السياق ويعدّون المراجعة.')}</dd>
          <dt>{t('Doctors', 'الأطباء')}</dt>
          <dd>{t('Review the evidence, choose the route and sign off.', 'يراجعون الأدلة ويختارون المسار ويوقّعون.')}</dd>
        </dl>
        <p className="login-foot">{t(
          'Research prototype for the Future Health Digital Innovation Challenge. All patients are fictional. It identifies risk and does not diagnose.',
          'نموذج بحثي أولي لتحدي الابتكار الرقمي للصحة المستقبلية. جميع المرضى خياليون. يحدد الخطر ولا يشخّص.',
        )}</p>
      </section>

      <section className="login-panel">
        <div className="login-top">
          <button type="button" className="link-btn" onClick={() => { window.location.hash = '#/'; }}>{t('Back to the home page', 'العودة إلى الصفحة الرئيسية', 'Kembali ke beranda')}</button>
          <span className="grow" />
          <LanguageSwitch />
        </div>
        <div className="login-form">
          <div className="login-tabs" role="tablist" aria-label={t('Account', 'الحساب')}>
            <button type="button" role="tab" id={`${panelId}-signin`} aria-selected={tab === 'signin'} aria-controls={panelId} onClick={() => setTab('signin')}>{t('Sign in', 'تسجيل الدخول')}</button>
            <button type="button" role="tab" id={`${panelId}-register`} aria-selected={tab === 'register'} aria-controls={panelId} onClick={() => setTab('register')}>{t('Create account', 'إنشاء حساب')}</button>
          </div>
          <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${tab}`}>
            {tab === 'signin' ? <SignInForm onNeedAccount={() => setTab('register')} /> : <RegisterForm onHaveAccount={() => setTab('signin')} />}
          </div>
          <div className="demo-box">
            <p className="small strong">{t('Exploring the prototype?', 'تستكشف النموذج الأولي؟')}</p>
            <div className="grid-2">
              <button type="button" className="btn" onClick={() => startDemo('doctor')}>{t('Continue as demo doctor', 'المتابعة كطبيب تجريبي')}</button>
              <button type="button" className="btn" onClick={() => startDemo('nurse')}>{t('Continue as demo nurse', 'المتابعة كممرضة تجريبية')}</button>
            </div>
            {demoError && <p className="field-error" role="alert">{errorText(demoError)}</p>}
            <p className="tiny muted">{API_MODE ? t(
              'Accounts and records are kept on the prototype server, which accepts fictional patients only. Do not enter real patient information or a password you use elsewhere.',
              'تُحفظ الحسابات والسجلات على خادم النموذج الأولي، الذي يقبل مرضى خياليين فقط. لا تُدخل معلومات مرضى حقيقية أو كلمة مرور تستخدمها في مكان آخر.',
              'Akun dan rekam disimpan di server prototipe, yang hanya menerima pasien fiktif. Jangan memasukkan data pasien nyata atau kata sandi yang Anda pakai di tempat lain.',
            ) : t(
              'Accounts stay only in this browser and nothing is sent to a server. This sign-in is not a security control, so do not enter real patient information or a password you use elsewhere.',
              'تبقى الحسابات في هذا المتصفح فقط ولا يُرسل شيء إلى خادم. تسجيل الدخول هذا ليس وسيلة حماية، فلا تُدخل معلومات مرضى حقيقية أو كلمة مرور تستخدمها في مكان آخر.',
            )}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function useErrorText() {
  const { t } = useApp();
  return (e: AuthError): string => ({
    name_required: t('Enter your full name.', 'أدخل اسمك الكامل.'),
    email_invalid: t('Enter a valid work email, like name@clinic.ae.', 'أدخل بريد عمل صحيحًا، مثل name@clinic.ae.'),
    password_short: t('Use at least 8 characters for the password.', 'استخدم 8 أحرف على الأقل لكلمة المرور.'),
    password_mismatch: t('The two passwords do not match.', 'كلمتا المرور غير متطابقتين.'),
    email_taken: API_MODE
      ? t('An account with this email already exists. Sign in instead.', 'يوجد حساب بهذا البريد. سجّل الدخول بدلًا من ذلك.', 'Akun dengan email ini sudah ada. Silakan masuk.')
      : t('An account with this email already exists in this browser. Sign in instead.', 'يوجد حساب بهذا البريد في هذا المتصفح. سجّل الدخول بدلًا من ذلك.'),
    bad_credentials: API_MODE
      ? t('That email and password do not match an account.', 'لا يطابق البريد وكلمة المرور أي حساب.', 'Email dan kata sandi tidak cocok dengan akun mana pun.')
      : t('That email and password do not match an account in this browser.', 'لا يطابق البريد وكلمة المرور أي حساب في هذا المتصفح.'),
    rate_limited: t('Too many attempts. Wait 15 minutes and try again.', 'محاولات كثيرة. انتظر 15 دقيقة ثم حاول مجددًا.', 'Terlalu banyak percobaan. Tunggu 15 menit lalu coba lagi.'),
    server_unavailable: t('The server could not be reached. Try again in a moment.', 'تعذر الوصول إلى الخادم. حاول مجددًا بعد قليل.', 'Server tidak dapat dihubungi. Coba lagi sebentar lagi.'),
    registration_closed: t('Accounts are created by an administrator on this deployment.', 'تُنشأ الحسابات بواسطة مسؤول في هذا النشر.', 'Akun dibuat oleh administrator pada deployment ini.'),
    crypto_unavailable: t('This browser cannot protect a password on this connection. Open the app over HTTPS or localhost, or use a demo account.', 'لا يستطيع هذا المتصفح حماية كلمة المرور على هذا الاتصال. افتح التطبيق عبر HTTPS أو localhost، أو استخدم حسابًا تجريبيًا.'),
    ack_required: t('Please confirm you understand this is a prototype.', 'يرجى تأكيد فهمك أن هذا نموذج أولي.'),
  })[e];
}

function SignInForm({ onNeedAccount }: { onNeedAccount: () => void }) {
  const { t, setSession } = useApp();
  const errorText = useErrorText();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signInAny(email, password, localStorage);
    setBusy(false);
    if ('session' in res) setSession(res.session);
    else setError(res.error);
  };

  return (
    <form className="stack" style={{ paddingTop: 16 }} onSubmit={submit} noValidate>
      <label className="field">{t('Work email', 'بريد العمل')}
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@clinic.ae" dir="ltr" required />
      </label>
      <label className="field">{t('Password', 'كلمة المرور')}
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <p className="field-error" role="alert">{errorText(error)}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email || !password}>{busy ? t('Signing in…', 'جارٍ تسجيل الدخول…') : t('Sign in', 'تسجيل الدخول')}</button>
      <button type="button" className="link-btn" onClick={onNeedAccount}>{t('New here? Create an account', 'جديد هنا؟ أنشئ حسابًا')}</button>
    </form>
  );
}

function RegisterForm({ onHaveAccount }: { onHaveAccount: () => void }) {
  const { t, setSession } = useApp();
  const errorText = useErrorText();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ClinicalRole>('nurse');
  const [facility, setFacility] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await registerAny({ name, email, role, facility, password, confirm, acknowledged }, localStorage);
    setBusy(false);
    if ('session' in res) setSession(res.session);
    else setError(res.error);
  };

  return (
    <form className="stack" style={{ paddingTop: 16 }} onSubmit={submit} noValidate>
      <label className="field">{t('Full name', 'الاسم الكامل')}
        <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Your name', 'اسمك')} aria-invalid={error === 'name_required'} />
      </label>
      <div className="grid-2">
        <label className="field">{t('Your role', 'دورك')}
          <select value={role} onChange={(e) => setRole(e.target.value as ClinicalRole)}>
            <option value="nurse">{t('Nurse', 'ممرض/ممرضة')}</option>
            <option value="doctor">{t('Doctor', 'طبيب/طبيبة')}</option>
          </select>
        </label>
        <label className="field">{t('Clinic or department (optional)', 'العيادة أو القسم (اختياري)')}
          <input type="text" autoComplete="organization" value={facility} onChange={(e) => setFacility(e.target.value)} />
        </label>
      </div>
      <label className="field">{t('Work email', 'بريد العمل')}
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@clinic.ae" dir="ltr" aria-invalid={error === 'email_invalid' || error === 'email_taken'} />
      </label>
      <div className="grid-2">
        <label className="field">{t('Password', 'كلمة المرور')}
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={error === 'password_short'} />
        </label>
        <label className="field">{t('Repeat password', 'تكرار كلمة المرور')}
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={error === 'password_mismatch'} />
        </label>
      </div>
      <p className="tiny muted">{t('Only doctors can sign off a care route. Nurses prepare the review and send it for sign-off.', 'يستطيع الأطباء فقط توقيع مسار الرعاية. يُعدّ الممرضون المراجعة ويرسلونها للتوقيع.')}</p>
      <label className="check small">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
        {t('I understand this is a research prototype with fictional patients, and I will not enter real patient information.', 'أفهم أن هذا نموذج بحثي أولي بمرضى خياليين، ولن أُدخل معلومات مرضى حقيقية.')}
      </label>
      {error && <p className="field-error" role="alert">{errorText(error)}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? t('Creating your account…', 'جارٍ إنشاء حسابك…') : t('Create account and open the queue', 'إنشاء الحساب وفتح القائمة')}</button>
      <button type="button" className="link-btn" onClick={onHaveAccount}>{t('Already have an account? Sign in', 'لديك حساب؟ سجّل الدخول')}</button>
    </form>
  );
}
