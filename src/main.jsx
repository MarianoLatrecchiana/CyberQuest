import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'framer-motion';
import { courseModules, finalQuestions } from './course-data';
import { isSupabaseConfigured, supabase } from './supabase';
import logoUrl from '../assets/logo-ciberseguridad.png';
import './styles.css';
import './overrides.css';

const PASS_SCORE = 140;
const MODULE_MAX_SCORE = 200;
const FINAL_UNLOCK_SCORE = 840;
const STORAGE_USERS = 'cq_react_users';
const STORAGE_SESSION = 'cq_react_session';
const progressStorageKey = (userId) => `cq_react_progress_${userId}`;

const hangmanConcepts = [
  { word: 'RANSOMWARE', definition: 'Tipo de software malicioso que bloquea o cifra información y exige un pago para recuperarla.' },
  { word: 'PHISHING', definition: 'Engaño que busca obtener credenciales o datos mediante mensajes, sitios o enlaces falsos.' },
  { word: 'MALWARE', definition: 'Término general para programas diseñados para dañar, alterar o acceder sin autorización a un equipo.' }
];

const signalChallenges = [
  { title: 'Mensaje que apura', text: 'Te llega un WhatsApp que parece ser de una empresa conocida: “Tu paquete está retenido. Pagá ahora desde este enlace”.', answer: 'Frenar y verificar por la web o app oficial, sin abrir el enlace.', signals: ['Te apura a actuar', 'Tiene un enlace', 'Pide un pago inesperado'] },
  { title: 'Aprobación inesperada', text: 'Tu celular muestra una solicitud para aprobar el acceso a tu cuenta, pero vos no estabas iniciando sesión.', answer: 'Rechazarla y cambiar o revisar la cuenta por un canal conocido.', signals: ['No iniciaste sesión', 'Alguien podría tener tu clave', 'El código no se comparte'] },
  { title: 'Pendrive encontrado', text: 'Encontrás un pendrive en la entrada de tu trabajo o edificio, con una etiqueta que dice “Fotos”.', answer: 'No conectarlo; entregarlo o reportarlo para que se revise de forma segura.', thirdOption: 'Dárselo a un compañero de trabajo para que lo revise.', signals: ['El dueño es desconocido', 'Puede contener archivos peligrosos', 'La curiosidad no es un control de seguridad'] }
];

const signalOptionOrders = {
  'Mensaje que apura': [1, 0, 2],
  'Aprobación inesperada': [0, 2, 1],
  'Pendrive encontrado': [2, 1, 0]
};

function getUsers() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_USERS) || '[]');
  const admin = { id: 'cq-admin', name: 'Administrador', email: 'admin@cyberquest.com', password: 'admin123', role: 'admin' };
  const otherUsers = saved.filter((user) => user.email !== admin.email);
  return [admin, ...otherUsers];
}

function getSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_SESSION) || 'null'); } catch { return null; }
}

function saveSession(user) {
  localStorage.setItem(STORAGE_SESSION, JSON.stringify(user));
}

function readProgress(user) {
  if (!user?.id) return { scores: {}, rewards: {} };
  try {
    return JSON.parse(localStorage.getItem(progressStorageKey(user.id)) || '{"scores":{},"rewards":{}}');
  } catch {
    return { scores: {}, rewards: {} };
  }
}

function App() {
  const [user, setUser] = useState(() => isSupabaseConfigured ? null : getSession());
  const [authReady, setAuthReady] = useState(() => !isSupabaseConfigured);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [screen, setScreen] = useState('auth');
  const [authMode, setAuthMode] = useState('login');
  const [notice, setNotice] = useState('');
  const [confirmationNotice, setConfirmationNotice] = useState('');
  const [scores, setScores] = useState(() => readProgress(getSession()).scores || {});
  const [rewards, setRewards] = useState(() => readProgress(getSession()).rewards || {});
  const [selectedModule, setSelectedModule] = useState(null);

  const isAdmin = user?.role === 'admin';
  const totalScore = isAdmin ? 1200 : Object.values(scores).reduce((sum, score) => sum + score, 0);
  const approvedModules = isAdmin
    ? courseModules.map((module) => module.id)
    : courseModules.filter((module) => (scores[module.id] || 0) >= PASS_SCORE).map((module) => module.id);
  const finalUnlocked = isAdmin || (approvedModules.length === courseModules.length && totalScore >= FINAL_UNLOCK_SCORE);

  async function loadCloudUser(authUser) {
    const { data, error } = await supabase.from('profiles').select('name, email, role, scores, rewards').eq('id', authUser.id).maybeSingle();
    if (error) {
      setNotice('No se pudo cargar tu progreso online. Revisá la configuración de Supabase.');
      setAuthReady(true);
      return;
    }
    const profile = data || {};
    setUser({ id: authUser.id, name: profile.name || authUser.user_metadata?.name || 'Participante', email: profile.email || authUser.email, role: profile.role || 'user' });
    setScores(profile.scores || {});
    setRewards(profile.rewards || {});
    setScreen('modules');
    setAuthReady(true);
    if (new URLSearchParams(window.location.search).has('code')) {
      setConfirmationNotice('Tu correo fue confirmado satisfactoriamente. Ya podés comenzar tu recorrido.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      if (!user) return;
      const progress = readProgress(user);
      setScores(progress.scores || {});
      setRewards(progress.rewards || {});
      setScreen('modules');
      return;
    }

    let active = true;
    async function restoreSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user && active) await loadCloudUser(data.session.user);
      else if (active) setAuthReady(true);
    }
    restoreSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setRecoveryNotice('Elegí una contraseña nueva para proteger tu cuenta.');
        setAuthReady(true);
        return;
      }
      if (session?.user) loadCloudUser(session.user);
      else { setUser(null); setScreen('auth'); setAuthReady(true); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured && user?.id) localStorage.setItem(progressStorageKey(user.id), JSON.stringify({ scores, rewards }));
  }, [user?.id, scores, rewards]);

  async function authenticate(formData) {
    const email = formData.email.trim().toLowerCase();
    const password = formData.password;

    if (isSupabaseConfigured) {
      setNotice('');
      if (authMode === 'recovery') {
        const redirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
        if (error) return setNotice('No pudimos enviar el enlace. Intentá nuevamente en unos minutos.');
        return setNotice('Si existe una cuenta con este correo, vas a recibir un enlace para crear una contraseña nueva.');
      }
      if (authMode === 'register') {
        if (!formData.name.trim()) return setNotice('Ingresá tu nombre para personalizar tu recorrido.');
        const redirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name: formData.name.trim() }, emailRedirectTo: redirectUrl } });
        if (error) {
          if (/database error saving new user/i.test(error.message)) {
            return setNotice('Usuario registrado exitosamente. Confirmá tu cuenta desde el correo que te enviamos para poder ingresar.');
          }
          const mayAlreadyExist = /already registered|already exists|duplicate key|users_email_partial_key/i.test(error.message);
          return setNotice(mayAlreadyExist
            ? 'Ya tenés una cuenta. Iniciá sesión para seguir con tu recorrido.'
            : 'No pudimos crear la cuenta en este momento. Revisá los datos e intentá nuevamente.');
        }
        if (data.session?.user) return loadCloudUser(data.session.user);
        if (data.user?.identities?.length === 0) return setNotice('Ya tenés una cuenta. Iniciá sesión para seguir con tu recorrido.');
        return setNotice('Cuenta creada. Revisá tu correo para confirmar la cuenta y después iniciá sesión.');
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return setNotice('Correo o contraseña incorrectos.');
      return loadCloudUser(data.user);
    }

    const users = getUsers();

    if (authMode === 'recovery') return setNotice('La recuperación por correo está disponible cuando CyberQuest está conectado a Supabase.');

    if (authMode === 'register') {
      if (!formData.name.trim()) return setNotice('Ingresá tu nombre para personalizar tu recorrido.');
      if (users.some((item) => item.email === email)) return setNotice('Ese correo ya está registrado. Probá iniciar sesión.');
      const newUser = { id: crypto.randomUUID(), name: formData.name.trim(), email, password, role: 'user' };
      localStorage.setItem(STORAGE_USERS, JSON.stringify([...users.filter((item) => item.role !== 'admin'), newUser]));
      saveSession(newUser);
      setUser(newUser);
      return;
    }

    const foundUser = users.find((item) => item.email === email && item.password === password);
    if (!foundUser) return setNotice('Correo o contraseña incorrectos.');
    saveSession(foundUser);
    setUser(foundUser);
  }

  async function logout() {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    localStorage.removeItem(STORAGE_SESSION);
    setUser(null);
    setScreen('auth');
    setNotice('Sesión cerrada correctamente.');
  }

  function openModule(module) {
    setSelectedModule(module);
    setScreen('course');
  }

  function persistProgress(nextScores, nextRewards) {
    if (isSupabaseConfigured && user?.id) {
      supabase.from('profiles').update({ scores: nextScores, rewards: nextRewards, updated_at: new Date().toISOString() }).eq('id', user.id).then(({ error }) => {
        if (error) setNotice('No se pudo guardar el último avance online. Intentá nuevamente.');
      });
    }
  }

  function finishModule(moduleId, score, activityRewards) {
    const nextScores = { ...scores, [moduleId]: score };
    const nextRewards = { ...rewards, [moduleId]: activityRewards };
    setScores(nextScores);
    setRewards(nextRewards);
    persistProgress(nextScores, nextRewards);
    setSelectedModule(null);
    setScreen('modules');
  }

  function saveModuleProgress(moduleId, activityRewards) {
    const nextScores = { ...scores, [moduleId]: activityRewards.length * 20 };
    const nextRewards = { ...rewards, [moduleId]: activityRewards };
    setScores(nextScores);
    setRewards(nextRewards);
    persistProgress(nextScores, nextRewards);
  }

  async function updatePassword(formData) {
    const password = formData.password || '';
    if (password.length < 8) return setRecoveryNotice('La contraseña debe tener al menos 8 caracteres.');
    if (password !== formData.confirmPassword) return setRecoveryNotice('Las contraseñas no coinciden. Revisalas e intentá nuevamente.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setRecoveryNotice('El enlace venció o no es válido. Pedí uno nuevo para continuar.');
    await supabase.auth.signOut();
    setRecoveryMode(false);
    setUser(null);
    setScreen('auth');
    setAuthMode('login');
    setNotice('Contraseña actualizada correctamente. Ya podés iniciar sesión.');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (recoveryMode) return <PasswordRecoveryScreen notice={recoveryNotice} onSubmit={updatePassword} />;
  if (!user) {
    return <AuthScreen mode={authMode} notice={authReady ? notice : 'Conectando tu cuenta…'} onModeChange={(mode) => { setAuthMode(mode); setNotice(''); }} onSubmit={authenticate} />;
  }

  return (
    <main className="cq-app-shell">
      <Header user={user} totalScore={totalScore} approved={approvedModules.length} onHome={() => setScreen('modules')} onModules={() => setScreen('modules')} onLogout={logout} />
      <AnimatePresence>{confirmationNotice && <EmailConfirmedNotice key="confirmed-email" message={confirmationNotice} onClose={() => setConfirmationNotice('')} />}</AnimatePresence>
      <AnimatePresence mode="wait">
        {screen === 'welcome' && <Welcome key="welcome" user={user} onStart={() => setScreen('modules')} />}
        {screen === 'modules' && <MissionBoard key="modules" approved={approvedModules} scores={scores} isAdmin={isAdmin} totalScore={totalScore} finalUnlocked={finalUnlocked} onOpen={openModule} onFinal={() => setScreen('final')} onGame={(game) => setScreen(game)} />}
        {screen === 'course' && selectedModule && <CourseFlow key={selectedModule.id} module={selectedModule} isAdmin={isAdmin} initialRewards={rewards[selectedModule.id] || []} onProgress={saveModuleProgress} onClose={() => setScreen('modules')} onFinish={finishModule} />}
        {screen === 'final' && <FinalChallenge key="final" onClose={() => setScreen('modules')} />}
        {screen === 'hangman' && <HangmanGame key="hangman" onClose={() => setScreen('modules')} />}
        {screen === 'signals' && <SignalsGame key="signals" onClose={() => setScreen('modules')} />}
      </AnimatePresence>
    </main>
  );
}

function EmailConfirmedNotice({ message, onClose }) {
  return <motion.aside className="cq-email-confirmed" role="status" initial={{ opacity: 0, y: -20, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -14, scale: .96 }}><img src={logoUrl} alt="" /><div><b>¡Correo confirmado!</b><span>{message}</span></div><button onClick={onClose} aria-label="Cerrar mensaje">×</button></motion.aside>;
}

function AuthScreen({ mode, notice, onModeChange, onSubmit }) {
  const isRegister = mode === 'register';
  const isRecovery = mode === 'recovery';
  const noticeTone = /^(Cuenta creada|Usuario registrado|Contraseña actualizada)/.test(notice) ? 'is-success' : /^(Ya tenés una cuenta|Correo o contraseña|No pudimos)/.test(notice) ? 'is-error' : '';
  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
  }
  return (
    <main className="cq-auth-page">
      <FloatingParticles />
      <motion.section className="cq-auth-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
    <Brand />
    <p className="cq-kicker">ACCESO SEGURO</p>
    <h1>{isRecovery ? 'Recuperá tu contraseña' : isRegister ? 'Creá tu cuenta' : 'Ingresá a tu recorrido'}</h1>
    <p>{isRecovery ? 'Ingresá tu correo y te enviaremos un enlace seguro para crear una contraseña nueva.' : isRegister ? 'Completá tus datos para empezar a aprender con desafíos.' : 'Entrená con situaciones reales y protegé lo que importa.'}</p>
    {notice && <p className={`cq-notice ${noticeTone}`}>{notice}</p>}
    <form onSubmit={handleSubmit} className="cq-auth-form">
      {isRegister && <label>Nombre y apellido<input name="name" autoComplete="name" placeholder="Ej. Mariano" required /></label>}
      <label>Correo electrónico<input name="email" type="email" autoComplete="username" placeholder="nombre@ejemplo.com" required /></label>
      {!isRecovery && <label>Contraseña<input name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength="8" placeholder="Mínimo 8 caracteres" required /></label>}
      <button className="cq-primary" type="submit">{isRecovery ? 'Enviar enlace de recuperación' : isRegister ? 'Crear cuenta y comenzar' : 'Ingresar al desafío'} <span>→</span></button>
    </form>
    {isRecovery ? <p className="cq-auth-switch">¿Recordaste tu contraseña? <button onClick={() => onModeChange('login')}>Iniciá sesión</button></p> : <><p className="cq-auth-switch">{isRegister ? '¿Ya tenés cuenta?' : '¿No tenés cuenta?'} <button onClick={() => onModeChange(isRegister ? 'login' : 'register')}>{isRegister ? 'Iniciá sesión' : 'Registrate'}</button></p>{!isRegister && <button className="cq-forgot-password" onClick={() => onModeChange('recovery')}>¿Olvidaste tu contraseña?</button>}</>}
      </motion.section>
    </main>
  );
}

function PasswordRecoveryScreen({ notice, onSubmit }) {
  function handleSubmit(event) { event.preventDefault(); onSubmit(Object.fromEntries(new FormData(event.currentTarget))); }
  const noticeTone = /^(Las contraseñas no coinciden|La contraseña debe|El enlace venció)/.test(notice) ? 'is-error' : '';
  return <main className="cq-auth-page"><FloatingParticles /><motion.section className="cq-auth-card cq-reset-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}><Brand /><p className="cq-kicker">CUENTA PROTEGIDA</p><h1>Creá una contraseña nueva</h1><p>Elegí una clave de al menos 8 caracteres y confirmala para actualizar tu acceso.</p>{notice && <p className={`cq-notice ${noticeTone}`}>{notice}</p>}<form onSubmit={handleSubmit} className="cq-auth-form"><label>Contraseña nueva<input name="password" type="password" autoComplete="new-password" minLength="8" placeholder="Mínimo 8 caracteres" required /></label><label>Repetí la contraseña nueva<input name="confirmPassword" type="password" autoComplete="new-password" minLength="8" placeholder="Repetí tu contraseña" required /></label><button className="cq-primary" type="submit">Actualizar contraseña <span>→</span></button></form></motion.section></main>;
}

function PointsBadge({ value }) { return <span className="cq-points-badge">🛡️ {value} pts</span>; }

function Header({ user, totalScore, approved, onHome, onModules, onLogout }) {
  const progress = Math.round((approved / courseModules.length) * 100);
  return <header className="cq-header"><button className="cq-brand-button" onClick={onHome} aria-label="Ir a mis misiones"><Brand /></button><div className="cq-header-actions"><button className="cq-progress" onClick={onModules}><span>Tu avance</span><i><b style={{ width: `${progress}%` }} /></i><strong>{progress}%</strong></button><PointsBadge value={totalScore} /><button className="cq-logout" onClick={onLogout}>↪ Cerrar sesión</button></div></header>;
}

function Brand() { return <span className="cq-brand"><img className="cq-brand-logo" src={logoUrl} alt="" /><strong>Cyber<span>Quest</span></strong></span>; }

function Welcome({ user, onStart }) {
  return <motion.section className="cq-welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><FloatingParticles />
    <div className="cq-welcome-copy"><p className="cq-greeting">¡Bienvenido, {user.name}!</p><p className="cq-kicker">ACADEMIA DIGITAL · EMPRESAS SEGURAS</p><h1>La seguridad se construye en cada decisión.</h1><p className="cq-lead">CyberQuest es una plataforma de capacitación interactiva para reconocer riesgos, proteger información sensible y actuar con seguridad en el trabajo y en la vida diaria.</p><p className="cq-summary"><b>Tu recorrido incluye 6 módulos:</b> contraseñas, correo personal / corporativo, protección de datos, amenazas cibernéticas, ingeniería social y grooming. En cada uno vas a encontrar contenido guiado, mini desafíos, situaciones reales y trivias.</p><button className="cq-primary" onClick={onStart}>Comenzar desafío <span>→</span></button></div>
    <IntroCarousel />
  </motion.section>;
}

function IntroCarousel() {
  const slides = [{ icon: '🎯', label: 'APLICÁ LO APRENDIDO', title: 'Situaciones reales', text: 'Decisiones cotidianas, personales o laborales.' }, { icon: '🧩', label: 'PASO A PASO', title: 'Aprendizaje activo', text: 'Practicá cada idea antes de seguir.' }, { icon: '🛡️', label: 'HÁBITOS QUE CUIDAN', title: 'Personas y equipos más seguros', text: 'Hábitos simples que previenen engaños.' }];
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  return <aside className={`cq-intro-carousel slide-${index}`}><AnimatePresence mode="wait"><motion.article className="cq-slide-card" key={slide.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}><div className="cq-slide-icon">{slide.icon}</div><p>{slide.label}</p><h2>{slide.title}</h2><span>{slide.text}</span><i aria-hidden="true">✦</i></motion.article></AnimatePresence><div className="cq-carousel-controls"><button aria-label="Tarjeta anterior" onClick={() => setIndex((index + slides.length - 1) % slides.length)}>←</button><span>{slides.map((_, item) => <i key={item} className={item === index ? 'active' : ''} />)}</span><button aria-label="Tarjeta siguiente" onClick={() => setIndex((index + 1) % slides.length)}>→</button></div></aside>;
}

function MissionBoard({ approved, scores, isAdmin, totalScore, finalUnlocked, onOpen, onFinal, onGame }) {
  return <motion.section className="cq-board" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><FloatingParticles />
    <BackgroundViruses />
    <section className="cq-board-intro"><div><p className="cq-kicker">RECORRIDO FORMATIVO</p><h1>Mis misiones</h1><p>Una pausa, una verificación y una buena decisión pueden cambiar el resultado.</p></div><SecurityOrb /></section>
    <section className="cq-mission-grid">{courseModules.map((module, index) => {
      const unlocked = isAdmin || index === 0 || approved.includes(courseModules[index - 1]?.id);
      const complete = isAdmin || approved.includes(module.id);
      return <motion.article key={module.id} className={`cq-mission-card ${unlocked ? 'is-unlocked' : 'is-locked'} ${complete ? 'is-complete' : ''}`} whileHover={unlocked ? { y: -7, scale: 1.01 } : {}}><span className="cq-mission-icon">{module.icon}</span><p>{complete ? 'MISIÓN SUPERADA' : unlocked ? 'MISIÓN DISPONIBLE' : 'MISIÓN BLOQUEADA'}</p><h2>{module.title}</h2><span>{module.subtitle}</span><div className="cq-card-footer"><b>{complete ? '🔓 Desbloqueada' : unlocked ? 'Abrir misión →' : '🔒 Bloqueada'}</b>{complete && <em><PointsBadge value={`${isAdmin ? MODULE_MAX_SCORE : scores[module.id]} / ${MODULE_MAX_SCORE}`} /></em>}</div>{unlocked && <button onClick={() => onOpen(module)}>{complete ? 'Repasar →' : 'Comenzar →'}</button>}</motion.article>;
    })}</section>
    <section className={`cq-final-card ${finalUnlocked ? 'is-final-unlocked' : ''}`}><div><p>EVALUACIÓN INTEGRAL</p><h2>Desafío final</h2><span>Combiná los seis temas para conquistar el desafío CyberQuest.</span><small>Necesitás al menos {FINAL_UNLOCK_SCORE} pts y las 6 misiones aprobadas.</small></div><button disabled={!finalUnlocked} onClick={onFinal}>{finalUnlocked ? 'Comenzar evaluación →' : '🔒 Bloqueado'}</button></section>
    <section className="cq-games-hub"><div><p className="cq-kicker">ENTRENAMIENTO EXTRA</p><h2>Minijuegos CyberQuest</h2><span>Practicá conceptos y decisiones con desafíos interactivos.</span></div><div className="cq-game-cards"><button onClick={() => onGame('hangman')}><b><HangmanLoopIcon /></b><strong>Ahorcado ciberseguro</strong><small>Descubrí el concepto antes de quedarte sin intentos.</small><em>Jugar →</em></button><button onClick={() => onGame('signals')}><b>🔎</b><strong>Detectá las señales</strong><small>Identificá alertas y elegí la respuesta segura.</small><em>Jugar →</em></button></div></section>
  </motion.section>;
}

function SecurityOrb() { return <div className="cq-security-orb" title="La seguridad comienza con una pausa"><i /><i /><i /><span className="cq-orb-virus v1" aria-hidden="true">🦠</span><span className="cq-orb-virus v2" aria-hidden="true">🦠</span><span className="cq-orb-virus v3" aria-hidden="true">🦠</span><span className="cq-orb-virus v4" aria-hidden="true">🦠</span><b>◉</b><span className="cq-orb-label">SEGURO</span></div>; }
function FloatingParticles() { return <div className="cq-particles" aria-hidden="true">{Array.from({ length: 26 }, (_, index) => <i key={index} />)}</div>; }
function BackgroundViruses() { return <div className="cq-background-viruses" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <span key={index} className={`virus-${index + 1}`}>🦠</span>)}</div>; }
function HangmanLoopIcon() {
  return <svg className="cq-hangman-loop" viewBox="0 0 64 64" aria-hidden="true"><path d="M10 55h44M20 55V10h25M45 10v10" /><motion.g animate={{ rotate: [-3, 3, -3] }} transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }} style={{ transformOrigin: '45px 24px' }}><circle cx="45" cy="27" r="6" /><path d="M45 33v13m0-9-7 6m7-6 7 6m-7 3-6 7m6-7 6 7" /></motion.g></svg>;
}

function CourseFlow({ module, isAdmin, initialRewards, onProgress, onClose, onFinish }) {
  const [step, setStep] = useState(0);
  const [rewardedActivities, setRewardedActivities] = useState(() => new Set(initialRewards));
  const [score, setScore] = useState(() => initialRewards.length * 20);
  const [highestStep, setHighestStep] = useState(0);
  const labels = ['1. Aprendé', '2. Decidí', '3. Aprendé', '4. Decidí', '5. Trivia', '6. Aprendé', '7. Trivia'];
  const advance = (next) => { setHighestStep((current) => Math.max(current, next)); setStep(next); };
  const addPoint = (activityId) => {
    if (rewardedActivities.has(activityId)) return;
    const nextRewards = new Set([...rewardedActivities, activityId]);
    setRewardedActivities(nextRewards);
    setScore(nextRewards.size * 20);
    onProgress(module.id, [...nextRewards]);
  };
  const current = step === 0 ? <LearnBlock module={module} phase={0} onCorrect={() => addPoint('learn-0')} onNext={() => advance(1)} />
    : step === 1 ? <ScenarioBlock module={module} scenario={module.scenarios[0]} onCorrect={() => addPoint('scenario-0')} onNext={() => advance(2)} />
      : step === 2 ? <LearnBlock module={module} phase={1} onCorrect={() => addPoint('learn-1')} onNext={() => advance(3)} />
        : step === 3 ? <ScenarioBlock module={module} scenario={module.scenarios[1]} onCorrect={() => addPoint('scenario-1')} onNext={() => advance(4)} />
          : step === 4 ? <QuizBlock questions={module.quizzes.slice(0, 3)} title="Trivia" activityPrefix="quiz" onCorrect={(questionIndex) => addPoint(`quiz-${questionIndex}`)} onNext={() => advance(5)} />
            : step === 5 ? <LearnBlock module={module} phase={2} onCorrect={() => addPoint('learn-2')} onNext={() => advance(6)} />
              : <QuizBlock questions={module.quizzes.slice(3)} title="Trivia final" activityPrefix="final-quiz" onCorrect={(questionIndex) => addPoint(`final-quiz-${questionIndex}`)} onNext={() => onFinish(module.id, score, [...rewardedActivities])} />;
  return <motion.section className="cq-course" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><button className="cq-back" onClick={onClose}>← Mis misiones</button><header className="cq-course-header"><span>{module.icon}</span><div><h1>{module.title}</h1><p>{module.subtitle}</p></div><b><PointsBadge value={`${score} / ${MODULE_MAX_SCORE}`} /></b></header><nav className="cq-stepper">{labels.map((label, index) => <button key={label} className={index === step ? 'active' : ''} disabled={!isAdmin && index > highestStep} onClick={() => setStep(index)}>{label}</button>)}</nav><AnimatePresence mode="wait"><motion.div key={step} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -18 }}>{current}</motion.div></AnimatePresence></motion.section>;
}

function LearnBlock({ module, phase, onCorrect, onNext }) {
  const [answered, setAnswered] = useState(false);
  const mini = module.minis[phase];
  const details = phase === 0 ? [module.learn.details[0]] : phase === 1 ? [module.learn.details[1]] : module.learn.details.slice(2);
  const pointGroups = [[0], [1, 2], [3]];
  return <article className="cq-activity"><p className="cq-kicker">CONTENIDO EDUCATIVO · BLOQUE {phase + 1} DE 3</p><h2>{phase === 0 ? module.learn.title : phase === 1 ? 'Profundizá el concepto' : 'Llevá el conocimiento a la práctica'}</h2>{phase === 0 && <p className="cq-activity-lead">{module.learn.intro}</p>}{details.map((detail) => <p className="cq-detail" key={detail}>{detail}</p>)}<div className="cq-learning-points">{pointGroups[phase].map((index) => module.learn.points[index]).filter(Boolean).map(([title, text]) => <div key={title}><b>{title}</b><span>{text}</span></div>)}</div><QuestionCard eyebrow={<>MINI DESAFÍO <PointsBadge value={20} /></>} item={mini} onCorrect={onCorrect} onAnswered={() => setAnswered(true)} />{answered && <button className="cq-primary" onClick={onNext}>{phase === 0 ? 'Ir a la situación →' : phase === 1 ? 'Ver la próxima situación →' : 'Ir a la trivia final →'}</button>}</article>;
}

function ScenarioBlock({ scenario, onCorrect, onNext }) {
  const [answered, setAnswered] = useState(false);
  const chatMatch = scenario.text.match(/^(.*?te escribe(?: por chat)?):\s*[“"](.+?)[”"]$/);
  const isChat = Boolean(scenario.person && chatMatch);
  const context = chatMatch?.[1] || '';
  const message = chatMatch?.[2] || scenario.text;
  const [messageVisible, setMessageVisible] = useState(!isChat);
  useEffect(() => {
    setMessageVisible(!isChat);
    if (!isChat) return undefined;
    const timer = window.setTimeout(() => setMessageVisible(true), 1450);
    return () => window.clearTimeout(timer);
  }, [scenario, isChat]);
  const picture = scenario.visual?.includes('/') ? <img src={scenario.visual} alt={scenario.person || 'Persona de la situación'} /> : <span className={`cq-scenario-emoji ${scenario.visual === '☎️' ? 'is-phone' : ''}`}>{scenario.visual}</span>;
  const avatarClass = `cq-person-avatar ${scenario.visual?.includes('/') ? '' : 'has-emoji'}`;
  const chat = isChat ? <><p className="cq-chat-context">{context}:</p><section className="cq-chat-window"><header><div className={avatarClass}>{picture}</div><div><b>{scenario.person.split(' · ')[0]}</b><small>● En línea</small></div><span>•••</span></header><div className="cq-chat-thread"><time>Ahora</time>{messageVisible ? <motion.p className="cq-chat-message" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{message}<small>✓✓</small></motion.p> : <div className="cq-typing"><i /><i /><i /></div>}</div></section></> : <section className={`cq-dialogue-scene ${scenario.note ? 'has-note' : ''}`}><div className={avatarClass}>{picture}</div><div className="cq-chat-content"><span>{scenario.person || 'Situación para analizar'}</span><p>{scenario.text}</p>{scenario.note && <motion.div className="cq-password-note" initial={{ opacity: 0, rotate: -7, y: 10 }} animate={{ opacity: 1, rotate: -3, y: 0 }}><small>NOTA ENCONTRADA</small><b>{scenario.note}</b></motion.div>}</div></section>;
  return <article className="cq-activity"><p className="cq-kicker">SITUACIÓN COTIDIANA <PointsBadge value={20} /></p><h2>{scenario.title}</h2>{chat}{messageVisible && <QuestionCard item={{ prompt: '¿Qué harías en este caso?', options: scenario.options, answer: scenario.answer, feedback: scenario.feedback }} onCorrect={onCorrect} onAnswered={() => setAnswered(true)} />}{answered && <button className="cq-primary" onClick={onNext}>Continuar →</button>}</article>;
}

function QuizBlock({ questions, title, activityPrefix, onCorrect, onNext }) {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const last = index === questions.length - 1;
  function next() { if (last) onNext(); else { setIndex((current) => current + 1); setAnswered(false); } }
  return <article className="cq-activity"><p className="cq-kicker">{title.toUpperCase()} · PREGUNTA {index + 1} DE {questions.length} <PointsBadge value={20} /></p><QuestionCard key={questions[index].prompt} item={questions[index]} onCorrect={() => onCorrect(index)} onAnswered={() => setAnswered(true)} />{answered && <button className="cq-primary" onClick={next}>{last ? 'Ver resultado del módulo →' : 'Siguiente pregunta →'}</button>}</article>;
}

function QuestionCard({ eyebrow, item, onCorrect, onAnswered }) {
  const [answer, setAnswer] = useState(null);
  const complete = answer !== null;
  function choose(index) { if (complete) return; setAnswer(index); if (index === item.answer) onCorrect(); onAnswered(); }
  return <section className="cq-question-card">{eyebrow && <p className="cq-kicker">{eyebrow}</p>}<h3>{item.prompt}</h3><div className="cq-options">{item.options.map((option, index) => <button key={option} disabled={complete} className={complete ? index === item.answer ? 'correct' : index === answer ? 'wrong' : '' : ''} onClick={() => choose(index)}><b>{String.fromCharCode(65 + index)}.</b> {option}</button>)}</div>{complete && <p className={`cq-feedback ${answer === item.answer ? 'good' : 'bad'}`}><b>{answer === item.answer ? '¡Muy bien! ' : 'Para recordar: '}</b>{item.feedback}</p>}</section>;
}

function HangmanGame({ onClose }) {
  const [concept, setConcept] = useState(() => hangmanConcepts[Math.floor(Math.random() * hangmanConcepts.length)]);
  const [guessed, setGuessed] = useState([]);
  const [errors, setErrors] = useState(0);
  const letters = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
  const complete = concept.word.split('').every((letter) => guessed.includes(letter));
  const lost = errors >= 5;
  const finished = complete || lost;
  const reveal = (letter) => {
    const normalized = String(letter || '').toUpperCase();
    if (finished || !letters.includes(normalized) || guessed.includes(normalized)) return;
    setGuessed((current) => [...current, normalized]);
    if (!concept.word.includes(normalized)) setErrors((current) => current + 1);
  };
  const newConcept = () => {
    const options = hangmanConcepts.filter((item) => item.word !== concept.word);
    setConcept(options[Math.floor(Math.random() * options.length)] || hangmanConcepts[0]);
    setGuessed([]);
    setErrors(0);
  };
  useEffect(() => {
    const onKeyDown = (event) => reveal(event.key);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
  return <section className="cq-game-page"><button className="cq-back" onClick={onClose}>← Mis misiones</button><header className="cq-game-header"><span className="cq-game-hangman-icon"><HangmanLoopIcon /></span><div><p className="cq-kicker">MINIJUEGO INTERACTIVO</p><h1>Ahorcado ciberseguro</h1><p>Descubrí conceptos clave antes de agotar tus intentos.</p></div></header><motion.article className={`cq-hangman ${finished ? complete ? 'is-won' : 'is-lost' : ''}`} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}><section className="cq-game-copy"><p className="cq-kicker">CONCEPTO OCULTO</p><div className="cq-definition"><b>Definición</b><span>{concept.definition}</span></div><div className="cq-hangman-word" aria-label="Palabra a descubrir">{concept.word.split('').map((letter, index) => <motion.span key={`${letter}-${index}`} animate={{ opacity: guessed.includes(letter) || lost ? 1 : .32, y: guessed.includes(letter) ? 0 : 4 }}>{guessed.includes(letter) || lost ? letter : '_'}</motion.span>)}</div><p className="cq-attempts">Errores: <b>{errors}</b> de 5</p><div className="cq-keyboard">{letters.map((letter) => <button key={letter} disabled={guessed.includes(letter) || finished} onClick={() => reveal(letter)}>{letter}</button>)}</div>{finished && <motion.div className={`cq-game-message ${complete ? 'good' : 'bad'}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><b>{complete ? '¡Concepto descubierto!' : `La palabra era ${concept.word}.`}</b><span>{complete ? 'Muy bien: reconociste una amenaza importante.' : 'Probá otro concepto y seguí entrenando.'}</span></motion.div>}<button className="cq-primary cq-new-concept" onClick={newConcept}>{finished ? 'Probar otro concepto →' : 'Cambiar concepto →'}</button></section><aside className="cq-gallows-card"><svg className="cq-gallows" viewBox="0 0 240 300" role="img" aria-label={`Ahorcado: ${errors} errores`}><path d="M25 280H205M65 280V25H158M157 25V67" /><motion.circle cx="157" cy="92" r="24" initial={false} animate={{ opacity: errors >= 1 ? 1 : 0, scale: errors >= 1 ? 1 : .2 }} /><motion.g initial={false} animate={{ y: errors >= 5 ? [0, 4, 112] : 0, rotate: errors >= 5 ? [0, 10, 72] : 0 }} transition={{ duration: .78, ease: 'easeIn' }} style={{ transformOrigin: '157px 116px' }}><motion.path d="M157 116V190" initial={false} animate={{ opacity: errors >= 2 ? 1 : 0 }} /><motion.path d="M157 137L126 164M157 137L188 164" initial={false} animate={{ opacity: errors >= 3 ? 1 : 0 }} /><motion.path d="M157 190L129 228M157 190L185 228" initial={false} animate={{ opacity: errors >= 4 ? 1 : 0 }} /></motion.g><motion.path className="cq-neck-line" d="M145 117H169" initial={false} animate={{ opacity: errors >= 5 ? 1 : 0, scaleX: errors >= 5 ? 1 : 0 }} /></svg><p>{finished ? complete ? '¡Lo resolviste!' : 'Casi, seguí practicando.' : 'Cada letra te acerca al concepto.'}</p></aside></motion.article></section>;
}

function SignalsGame({ onClose }) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [messageVisible, setMessageVisible] = useState(false);
  const item = signalChallenges[index];
  const isWhatsAppChallenge = index === 0;
  const isApprovalChallenge = index === 1;
  const isPendriveChallenge = index === 2;
  const baseOptions = [{ text: item.answer, isCorrect: true }, { text: 'Abrirlo o conectarlo para comprobar si realmente hay un problema.', isCorrect: false }, { text: item.thirdOption || 'Esperar, porque si fuera importante alguien volverá a escribir.', isCorrect: false }];
  const options = (signalOptionOrders[item.title] || [0, 1, 2]).map((optionIndex) => baseOptions[optionIndex]);
  const correct = answer !== null && options[answer]?.isCorrect;
  useEffect(() => {
    setMessageVisible(!isWhatsAppChallenge);
    if (!isWhatsAppChallenge) return undefined;
    const timer = window.setTimeout(() => setMessageVisible(true), 1500);
    return () => window.clearTimeout(timer);
  }, [index, isWhatsAppChallenge]);
  const situation = isWhatsAppChallenge
    ? <section className="cq-whatsapp-chat"><header><span>📦</span><div><b>Envíos Express</b><small>en línea</small></div><i>•••</i></header><div className="cq-whatsapp-thread"><time>Ahora</time>{messageVisible ? <><motion.p className="cq-whatsapp-message" initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }}>Tu paquete está retenido. Para liberarlo, seguí este enlace.<small>✓✓</small></motion.p><motion.p className="cq-whatsapp-message cq-whatsapp-link" initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .45 }}>🔗 envios-express-seguimiento.example/activar<small>✓✓</small></motion.p></> : <div className="cq-whatsapp-typing"><i /><i /><i /></div>}</div></section>
    : isApprovalChallenge ? <section className="cq-phone-scene"><motion.div className="cq-real-phone" initial={{ opacity: 0, y: 15, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }}><img src={`${import.meta.env.BASE_URL}security-notice-phone.png`} alt="Una persona sostiene un celular que muestra una alerta de seguridad" /><div className="cq-real-phone-notice"><div className="cq-real-phone-status"><span>9:41</span><b>● ● ●</b></div><header><span>🛡️</span><div><b>Aviso de seguridad</b><small>Ahora</small></div></header><div className="cq-real-phone-message"><motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25 }}>Detectamos un inicio de sesión en tu cuenta desde un dispositivo nuevo.</motion.p><motion.div className="cq-approval-request" initial={{ opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .55 }}><b>¿Reconocés esta actividad?</b><span>Si fuiste vos, desestimá este aviso. Si no fuiste vos, revisá la seguridad desde la app oficial.</span><div><button>No fui yo</button><button>Fui yo</button></div></motion.div></div></div></motion.div></section>
    : isPendriveChallenge ? <motion.figure className="cq-pendrive-photo" initial={{ opacity: 0, scale: .985 }} animate={{ opacity: 1, scale: 1 }}><img src={`${import.meta.env.BASE_URL}found-pendrive-office.png`} alt="Una mujer alcanza un pendrive sin identificar en el piso de una oficina" /><figcaption>Un pendrive sin identificar aparece cerca de la entrada de la oficina.</figcaption></motion.figure>
    : <section className="cq-signal-situation"><span>💬</span><p>{item.text}</p></section>;
  const continueGame = () => {
    if (index === signalChallenges.length - 1) setFinished(true);
    else { setIndex((current) => current + 1); setAnswer(null); }
  };
  const restart = () => { setIndex(0); setAnswer(null); setScore(0); setFinished(false); };
  if (finished) return <section className="cq-game-page"><button className="cq-back" onClick={onClose}>← Mis misiones</button><motion.article className="cq-game-result" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }}><span>🔎</span><p className="cq-kicker">MIRADA ENTRENADA</p><h1>{score} de {signalChallenges.length} señales resueltas</h1><p>{score === signalChallenges.length ? 'Reconociste cuándo conviene frenar y verificar. Esa pausa puede evitar muchos engaños.' : 'Frente a la urgencia o a algo inesperado, frená, verificá por un canal conocido y pedí ayuda.'}</p><div><button className="cq-primary" onClick={restart}>Jugar de nuevo →</button><button className="cq-secondary" onClick={onClose}>Volver a misiones</button></div></motion.article></section>;
  return <section className="cq-game-page"><button className="cq-back" onClick={onClose}>← Mis misiones</button><header className="cq-game-header"><span>🔎</span><div><p className="cq-kicker">MINIJUEGO INTERACTIVO · {index + 1} DE {signalChallenges.length}</p><h1>Detectá las señales</h1><p>Observá la situación y elegí la respuesta más segura.</p></div></header><motion.article key={item.title} className="cq-signals-card" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}><h2>{item.title}</h2>{situation}<p className="cq-kicker">SEÑALES PARA DETECTAR</p><div className="cq-signal-list">{item.signals.map((signal, signalIndex) => <motion.div key={signal} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: signalIndex * .12 }}><small>SEÑAL N.º {signalIndex + 1}</small><b>{signal}</b></motion.div>)}</div><h3>¿Cuál es la respuesta más segura?</h3><div className="cq-options">{options.map((option, optionIndex) => <button key={option.text} disabled={answer !== null} className={answer !== null ? option.isCorrect ? 'correct' : optionIndex === answer ? 'wrong' : '' : ''} onClick={() => { setAnswer(optionIndex); if (option.isCorrect) setScore((current) => current + 1); }}><b>{String.fromCharCode(65 + optionIndex)}.</b> {option.text}</button>)}</div>{answer !== null && <motion.div className={`cq-feedback ${correct ? 'good' : 'bad'}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><b>{correct ? '¡Bien visto! ' : 'Para recordar: '}</b>{item.answer}</motion.div>}{answer !== null && <button className="cq-primary cq-next-game" onClick={continueGame}>{index === signalChallenges.length - 1 ? 'Ver resultado →' : 'Siguiente situación →'}</button>}</motion.article></section>;
}

function FinalChallenge({ onClose }) {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const item = finalQuestions[index];
  function next() { if (index === finalQuestions.length - 1) setFinished(true); else { setIndex((current) => current + 1); setAnswered(false); } }
  if (finished) return <section className="cq-course"><button className="cq-back" onClick={onClose}>← Mis misiones</button><article className="cq-activity cq-result"><span>🏆</span><p className="cq-kicker">RESULTADO INTEGRAL</p><h1>{correct} de {finalQuestions.length} respuestas correctas</h1><p>{correct >= 8 ? 'Excelente desempeño: aplicaste prácticas seguras en la mayoría de las situaciones.' : 'Repasá los módulos que te resultaron más difíciles. Cada intento fortalece tus decisiones cotidianas.'}</p><button className="cq-primary" onClick={onClose}>Volver a mis módulos →</button></article></section>;
  return <section className="cq-course"><button className="cq-back" onClick={onClose}>← Mis misiones</button><header className="cq-course-header"><span>🏆</span><div><h1>Desafío final</h1><p>Una evaluación integral de los seis módulos.</p></div></header><article className="cq-activity"><p className="cq-kicker">EVALUACIÓN INTEGRAL · {index + 1} DE {finalQuestions.length}</p><QuestionCard key={item.prompt} item={item} onCorrect={() => setCorrect((value) => value + 1)} onAnswered={() => setAnswered(true)} />{answered && <button className="cq-primary" onClick={next}>{index === finalQuestions.length - 1 ? 'Ver resultado final →' : 'Siguiente desafío →'}</button>}</article></section>;
}

createRoot(document.getElementById('root')).render(<App />);
