import { useEffect, useMemo, useRef, useState } from 'react';
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
const navigationStorageKey = (userId) => `cq_react_navigation_${userId}`;
const attemptStorageKey = (userId, moduleId) => `cq_react_attempt_${userId}_${moduleId}`;
const courseStateStorageKey = (userId) => `cq_react_course_state_${userId}`;

const hangmanConcepts = [
  { word: 'RANSOMWARE', definition: 'Tipo de software malicioso que bloquea o cifra información y exige un pago para recuperarla.' },
  { word: 'PHISHING', definition: 'Engaño que busca obtener credenciales o datos mediante mensajes, sitios o enlaces falsos.' },
  { word: 'MALWARE', definition: 'Término general para programas diseñados para dañar, alterar o acceder sin autorización a un equipo.' },
  { word: 'FIREWALL', definition: 'Barrera de seguridad que controla qué conexiones pueden entrar o salir de una red.' },
  { word: 'SPYWARE', definition: 'Programa malicioso que espía la actividad de una persona sin su permiso.' },
  { word: 'CONTRASEÑA', definition: 'Clave secreta que protege el acceso a una cuenta, aplicación o dispositivo.' }
];
let nextHangmanConceptIndex = 0;

const signalChallenges = [
  { title: 'Mensaje inesperado', text: 'Un número que no tenés agendado te escribe por WhatsApp y dice: “Tu paquete está retenido. Pagá ahora para evitar que sea devuelto”.', answer: 'Frenar y verificar por la web, app o correo oficial de la empresa, sin abrir el enlace.', signals: ['Genera urgencia para actuar', 'Incluye un enlace sospechoso', 'El remitente es desconocido'] },
  { title: 'Inicio de sesión no reconocido', text: 'Tu celular muestra un aviso de inicio de sesión desde un dispositivo nuevo, pero vos no estabas ingresando a tu cuenta.', answer: 'Marcar “No fui yo” y revisar las sesiones y contraseña desde la app oficial.', wrongOptions: ['Marcar “Fui yo” para sacar la notificación.', 'Ignorar el aviso y revisar la cuenta más tarde.'], signals: ['Detectás un dispositivo nuevo', 'No reconocés ese inicio de sesión', 'La alerta te pide confirmar la actividad'] },
  { title: 'Pendrive encontrado', text: 'Encontrás un pendrive en la entrada de tu trabajo o edificio, con una etiqueta que dice “Fotos”.', answer: 'No conectarlo; entregarlo o reportarlo para que se revise de forma segura.', thirdOption: 'Dárselo a un compañero de trabajo para que lo revise.', signals: ['No sabés quién lo dejó', 'Podría contener archivos maliciosos', 'La curiosidad no es un control de seguridad'] }
];

const signalOptionOrders = {
  'Mensaje inesperado': [1, 0, 2],
  'Inicio de sesión no reconocido': [0, 2, 1],
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
    const progress = JSON.parse(localStorage.getItem(progressStorageKey(user.id)) || '{"scores":{},"rewards":{}}');
    const rewards = Object.fromEntries(Object.entries(progress.rewards || {}).map(([moduleId, activities]) => [moduleId, [...new Set(activities || [])]]));
    const scores = Object.fromEntries(Object.entries(rewards).map(([moduleId, activities]) => [moduleId, Math.min(activities.length * 20, MODULE_MAX_SCORE)]));
    return { scores, rewards };
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
  const courseStateRef = useRef(null);
  const courseSaveChainRef = useRef(Promise.resolve());
  const [courseState, setCourseState] = useState(() => {
    const initialCourseState = readCourseState(getSession());
    courseStateRef.current = initialCourseState;
    return initialCourseState;
  });
  const [selectedModule, setSelectedModule] = useState(null);
  const [courseStep, setCourseStep] = useState(0);
  const [courseHighestStep, setCourseHighestStep] = useState(0);
  const [courseSubstep, setCourseSubstep] = useState(0);
  const [courseAttempt, setCourseAttempt] = useState(1);
  const [finalAttempt, setFinalAttempt] = useState(1);
  const [teamProfiles, setTeamProfiles] = useState([]);
  const [teamStatsLoading, setTeamStatsLoading] = useState(false);
  const [teamStatsError, setTeamStatsError] = useState('');

  const isAdmin = user?.role === 'admin';
  const totalScore = isAdmin ? 1200 : Object.values(scores).reduce((sum, score) => sum + score, 0);
  const approvedModules = isAdmin
    ? courseModules.map((module) => module.id)
    : courseModules.filter((module) => (scores[module.id] || 0) >= PASS_SCORE).map((module) => module.id);
  const finalUnlocked = isAdmin || (approvedModules.length === courseModules.length && totalScore >= FINAL_UNLOCK_SCORE);

  async function loadCloudUser(authUser, { showWelcome = false } = {}) {
    let { data, error } = await supabase.from('profiles').select('name, email, role, scores, rewards, course_state').eq('id', authUser.id).maybeSingle();
    if (error && /course_state/i.test(error.message || '')) {
      ({ data, error } = await supabase.from('profiles').select('name, email, role, scores, rewards').eq('id', authUser.id).maybeSingle());
    }
    if (error) {
      setNotice('No se pudo cargar tu progreso online. Revisá la configuración de Supabase.');
      setAuthReady(true);
      return;
    }
    const profile = data || {};
    const restoredUser = { id: authUser.id, name: profile.name || authUser.user_metadata?.name || 'Participante', email: profile.email || authUser.email, role: profile.role || 'user' };
    setUser(restoredUser);
    const cleanRewards = Object.fromEntries(Object.entries(profile.rewards || {}).map(([moduleId, activities]) => [moduleId, [...new Set(activities || [])]]));
    setScores(Object.fromEntries(Object.entries(cleanRewards).map(([moduleId, activities]) => [moduleId, Math.min(activities.length * 20, MODULE_MAX_SCORE)])));
    setRewards(cleanRewards);
    const cloudCourseState = normalizeCourseState(profile.course_state);
    const localCourseState = readCourseState(restoredUser);
    const useNewerLocalCourseState = isCourseStateNewer(localCourseState, cloudCourseState);
    const restoredCourseState = useNewerLocalCourseState ? localCourseState : cloudCourseState;
    courseStateRef.current = restoredCourseState;
    setCourseState(restoredCourseState);
    localStorage.setItem(courseStateStorageKey(restoredUser.id), JSON.stringify(restoredCourseState));
    if (useNewerLocalCourseState) queueCourseStatePersistence(restoredUser.id, restoredCourseState);
    const activeCheckpoint = restoredCourseState.modules[restoredCourseState.activeModuleId];
    if (activeCheckpoint && !activeCheckpoint.completed) {
      restoreCourseCheckpoint(restoredCourseState, setScreen, setSelectedModule, setCourseStep, setCourseHighestStep, setCourseSubstep, setCourseAttempt);
    } else if (showWelcome) {
      setSelectedModule(null);
      setCourseStep(0);
      setCourseHighestStep(0);
      setCourseSubstep(0);
      setScreen('welcome');
    } else {
      restoreNavigation(restoredUser.id, setScreen, setSelectedModule, setCourseStep, setCourseAttempt);
    }
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
      const restoredCourseState = readCourseState(user);
      courseStateRef.current = restoredCourseState;
      setCourseState(restoredCourseState);
      const activeCheckpoint = restoredCourseState.modules[restoredCourseState.activeModuleId];
      if (activeCheckpoint && !activeCheckpoint.completed) restoreCourseCheckpoint(restoredCourseState, setScreen, setSelectedModule, setCourseStep, setCourseHighestStep, setCourseSubstep, setCourseAttempt);
      else restoreNavigation(user.id, setScreen, setSelectedModule, setCourseStep, setCourseAttempt);
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
      if (event === 'SIGNED_OUT' || !session) { setUser(null); setScreen('auth'); setAuthReady(true); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  function loadLocalUser(localUser, { showWelcome = false } = {}) {
    setUser(localUser);
    const progress = readProgress(localUser);
    setScores(progress.scores || {});
    setRewards(progress.rewards || {});
    const restoredCourseState = readCourseState(localUser);
    courseStateRef.current = restoredCourseState;
    setCourseState(restoredCourseState);
    const activeCheckpoint = restoredCourseState.modules[restoredCourseState.activeModuleId];
    if (activeCheckpoint && !activeCheckpoint.completed) {
      restoreCourseCheckpoint(restoredCourseState, setScreen, setSelectedModule, setCourseStep, setCourseHighestStep, setCourseSubstep, setCourseAttempt);
    } else if (showWelcome) {
      setSelectedModule(null);
      setCourseStep(0);
      setCourseHighestStep(0);
      setCourseSubstep(0);
      setScreen('welcome');
    } else {
      restoreNavigation(localUser.id, setScreen, setSelectedModule, setCourseStep, setCourseAttempt);
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured && user?.id) localStorage.setItem(progressStorageKey(user.id), JSON.stringify({ scores, rewards }));
  }, [user?.id, scores, rewards]);

  useEffect(() => {
    if (!user?.id || screen === 'auth') return;
    const navigation = screen === 'course' && selectedModule
      ? { screen, moduleId: selectedModule.id, step: courseStep, attempt: courseAttempt }
      : { screen };
    localStorage.setItem(navigationStorageKey(user.id), JSON.stringify(navigation));
  }, [user?.id, screen, selectedModule?.id, courseStep, courseAttempt]);

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
      return loadCloudUser(data.user, { showWelcome: true });
    }

    const users = getUsers();

    if (authMode === 'recovery') return setNotice('La recuperación por correo está disponible cuando CyberQuest está conectado a Supabase.');

    if (authMode === 'register') {
      if (!formData.name.trim()) return setNotice('Ingresá tu nombre para personalizar tu recorrido.');
      if (users.some((item) => item.email === email)) return setNotice('Ese correo ya está registrado. Probá iniciar sesión.');
      const newUser = { id: crypto.randomUUID(), name: formData.name.trim(), email, password, role: 'user' };
      localStorage.setItem(STORAGE_USERS, JSON.stringify([...users.filter((item) => item.role !== 'admin'), newUser]));
      saveSession(newUser);
      loadLocalUser(newUser, { showWelcome: true });
      return;
    }

    const foundUser = users.find((item) => item.email === email && item.password === password);
    if (!foundUser) return setNotice('Correo o contraseña incorrectos.');
    saveSession(foundUser);
    loadLocalUser(foundUser, { showWelcome: true });
  }

  async function logout() {
    await courseSaveChainRef.current;
    if (isSupabaseConfigured) await supabase.auth.signOut();
    localStorage.removeItem(STORAGE_SESSION);
    setUser(null);
    setScreen('auth');
    setNotice('Sesión cerrada correctamente.');
  }

  function queueCourseStatePersistence(userId, nextState) {
    if (!userId) return Promise.resolve();
    localStorage.setItem(courseStateStorageKey(userId), JSON.stringify(nextState));
    if (!isSupabaseConfigured) return Promise.resolve();
    const pendingSave = courseSaveChainRef.current.then(async () => {
      const { error } = await supabase.from('profiles').update({ course_state: nextState, updated_at: new Date().toISOString() }).eq('id', userId);
      if (error) throw error;
    });
    courseSaveChainRef.current = pendingSave.catch(() => {
      setNotice('No se pudo guardar el recorrido del módulo online. Intentá nuevamente.');
    });
    return courseSaveChainRef.current;
  }

  function persistCourseState(nextState) {
    if (!user?.id) return Promise.resolve();
    return queueCourseStatePersistence(user.id, nextState);
  }

  function saveModuleCheckpoint(moduleId, patch, active = true) {
    const currentCourseState = normalizeCourseState(courseStateRef.current);
    const previous = currentCourseState.modules[moduleId] || {};
    const nextState = {
      activeModuleId: active ? moduleId : null,
      modules: {
        ...currentCourseState.modules,
        [moduleId]: { ...previous, ...patch, updatedAt: new Date().toISOString() }
      }
    };
    courseStateRef.current = nextState;
    setCourseState(nextState);
    persistCourseState(nextState);
    return nextState.modules[moduleId];
  }

  function openModule(module) {
    const savedCheckpoint = normalizeCourseState(courseStateRef.current).modules[module.id];
    if (savedCheckpoint && !savedCheckpoint.completed) {
      setSelectedModule(module);
      setCourseStep(Math.max(0, Math.min(6, Number(savedCheckpoint.step) || 0)));
      setCourseHighestStep(Math.max(0, Math.min(6, Number(savedCheckpoint.highestStep) || 0)));
      setCourseSubstep(Math.max(0, Number(savedCheckpoint.substep) || 0));
      setCourseAttempt(Math.max(1, Number(savedCheckpoint.attempt) || 1));
      saveModuleCheckpoint(module.id, savedCheckpoint);
      setScreen('course');
      return;
    }
    const savedAttempt = Number(savedCheckpoint?.attempt) || 0;
    const deviceAttempt = user?.id ? Number(localStorage.getItem(attemptStorageKey(user.id, module.id)) || '0') : Math.max(0, courseAttempt - 1);
    const nextAttempt = Math.max(savedAttempt, deviceAttempt) + 1;
    if (user?.id) localStorage.setItem(attemptStorageKey(user.id, module.id), String(nextAttempt));
    setSelectedModule(module);
    setCourseStep(0);
    setCourseHighestStep(0);
    setCourseSubstep(0);
    setCourseAttempt(nextAttempt);
    saveModuleCheckpoint(module.id, { step: 0, highestStep: 0, substep: 0, attempt: nextAttempt, completed: false, answers: {} });
    if (user?.id) localStorage.setItem(navigationStorageKey(user.id), JSON.stringify({ screen: 'course', moduleId: module.id, step: 0, attempt: nextAttempt }));
    setScreen('course');
  }

  function rememberCourseStep(step, highestStep) {
    setCourseStep(step);
    setCourseHighestStep(highestStep);
    setCourseSubstep(0);
    if (selectedModule) saveModuleCheckpoint(selectedModule.id, { step, highestStep, substep: 0, attempt: courseAttempt, completed: false });
    if (user?.id && selectedModule) localStorage.setItem(navigationStorageKey(user.id), JSON.stringify({ screen: 'course', moduleId: selectedModule.id, step, attempt: courseAttempt }));
  }

  function rememberCourseSubstep(substep) {
    setCourseSubstep(substep);
    if (selectedModule) saveModuleCheckpoint(selectedModule.id, { step: courseStep, highestStep: courseHighestStep, substep, attempt: courseAttempt, completed: false });
  }

  function rememberCourseAnswers(answers) {
    if (selectedModule) saveModuleCheckpoint(selectedModule.id, { step: courseStep, highestStep: courseHighestStep, substep: courseSubstep, attempt: courseAttempt, completed: false, answers });
  }

  function returnToModules() {
    if (user?.id) localStorage.setItem(navigationStorageKey(user.id), JSON.stringify({ screen: 'modules' }));
    setScreen('modules');
  }

  function openFinalChallenge() {
    setFinalAttempt((current) => current + 1);
    setScreen('final');
  }

  function persistProgress(nextScores, nextRewards) {
    if (isSupabaseConfigured && user?.id) {
      supabase.from('profiles').update({ scores: nextScores, rewards: nextRewards, updated_at: new Date().toISOString() }).eq('id', user.id).then(({ error }) => {
        if (error) setNotice('No se pudo guardar el último avance online. Intentá nuevamente.');
      });
    }
  }

  function finishModule(moduleId, score, activityRewards) {
    const uniqueRewards = [...new Set(activityRewards)];
    const nextScores = { ...scores, [moduleId]: Math.min(uniqueRewards.length * 20, MODULE_MAX_SCORE) };
    const nextRewards = { ...rewards, [moduleId]: uniqueRewards };
    setScores(nextScores);
    setRewards(nextRewards);
    persistProgress(nextScores, nextRewards);
    setSelectedModule(null);
    setCourseStep(0);
    setCourseHighestStep(0);
    setCourseSubstep(0);
    saveModuleCheckpoint(moduleId, { step: 6, highestStep: 6, substep: 0, attempt: courseAttempt, completed: true }, false);
    returnToModules();
  }

  function saveModuleProgress(moduleId, activityRewards) {
    const uniqueRewards = [...new Set(activityRewards)];
    const nextScores = { ...scores, [moduleId]: Math.min(uniqueRewards.length * 20, MODULE_MAX_SCORE) };
    const nextRewards = { ...rewards, [moduleId]: uniqueRewards };
    setScores(nextScores);
    setRewards(nextRewards);
    persistProgress(nextScores, nextRewards);
  }

  async function openStatistics() {
    setScreen('stats');
    if (!isAdmin) return;
    if (!isSupabaseConfigured) {
      setTeamProfiles(getUsers().filter((profile) => profile.role !== 'admin').map((profile) => ({ ...profile, ...readProgress(profile) })));
      return;
    }
    setTeamStatsLoading(true);
    setTeamStatsError('');
    const { data, error } = await supabase.from('profiles').select('id, name, email, role, scores, rewards, updated_at').neq('role', 'admin').order('name');
    setTeamStatsLoading(false);
    if (error) {
      setTeamStatsError('No pudimos cargar las estadísticas del equipo. Verificá la política de administrador en Supabase.');
      return;
    }
    setTeamProfiles(data || []);
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
      <Header totalScore={totalScore} onHome={returnToModules} onModules={returnToModules} onStats={openStatistics} onLogout={logout} />
      <AnimatePresence>{confirmationNotice && <EmailConfirmedNotice key="confirmed-email" message={confirmationNotice} onClose={() => setConfirmationNotice('')} />}</AnimatePresence>
      <AnimatePresence mode="wait">
        {screen === 'welcome' && <Welcome key="welcome" user={user} onStart={() => setScreen('modules')} />}
        {screen === 'modules' && <MissionBoard key="modules" approved={approvedModules} scores={scores} isAdmin={isAdmin} totalScore={totalScore} finalUnlocked={finalUnlocked} onOpen={openModule} onFinal={openFinalChallenge} onGame={(game) => setScreen(game)} />}
        {screen === 'course' && selectedModule && <CourseFlow key={`${selectedModule.id}-${courseAttempt}`} module={selectedModule} isAdmin={isAdmin} initialRewards={rewards[selectedModule.id] || []} initialStep={courseStep} initialHighestStep={courseHighestStep} initialSubstep={courseSubstep} initialAnswers={courseState.modules[selectedModule.id]?.answers || {}} attempt={courseAttempt} onStepChange={rememberCourseStep} onSubstepChange={rememberCourseSubstep} onAnswersChange={rememberCourseAnswers} onProgress={saveModuleProgress} onClose={returnToModules} onFinish={finishModule} />}
        {screen === 'stats' && <StatisticsPage key="stats" scores={scores} isAdmin={isAdmin} teamProfiles={teamProfiles} loading={teamStatsLoading} error={teamStatsError} onRefresh={openStatistics} onClose={() => setScreen('modules')} />}
        {screen === 'final' && <FinalChallenge key={`final-${finalAttempt}`} attempt={finalAttempt} onClose={returnToModules} />}
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

function normalizeCourseState(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const modules = raw.modules && typeof raw.modules === 'object' ? raw.modules : {};
  return { activeModuleId: typeof raw.activeModuleId === 'string' ? raw.activeModuleId : null, modules };
}

function courseStateUpdatedAt(courseState) {
  return Math.max(0, ...Object.values(normalizeCourseState(courseState).modules).map((checkpoint) => Date.parse(checkpoint?.updatedAt || '') || 0));
}

function isCourseStateNewer(candidate, baseline) {
  return courseStateUpdatedAt(candidate) > courseStateUpdatedAt(baseline);
}

function readCourseState(user) {
  if (!user?.id) return normalizeCourseState();
  try { return normalizeCourseState(JSON.parse(localStorage.getItem(courseStateStorageKey(user.id)) || '{}')); } catch { return normalizeCourseState(); }
}

function readNavigation(userId) {
  if (!userId) return null;
  try { return JSON.parse(localStorage.getItem(navigationStorageKey(userId)) || 'null'); } catch { return null; }
}

function restoreNavigation(userId, setScreen, setSelectedModule, setCourseStep, setCourseAttempt) {
  const saved = readNavigation(userId);
  if (saved?.screen === 'course') {
    const module = courseModules.find((item) => item.id === saved.moduleId);
    if (module) {
      setSelectedModule(module);
      setCourseStep(Math.max(0, Math.min(6, Number(saved.step) || 0)));
      setCourseAttempt(Math.max(1, Number(saved.attempt) || 1));
      setScreen('course');
      return;
    }
  }
  if (['welcome', 'hangman', 'signals', 'stats', 'final'].includes(saved?.screen)) {
    setScreen(saved.screen);
    return;
  }
  setScreen('modules');
}

function restoreCourseCheckpoint(courseState, setScreen, setSelectedModule, setCourseStep, setCourseHighestStep, setCourseSubstep, setCourseAttempt) {
  const moduleId = courseState.activeModuleId;
  const checkpoint = courseState.modules[moduleId];
  const module = courseModules.find((item) => item.id === moduleId);
  if (!module || !checkpoint || checkpoint.completed) {
    setScreen('modules');
    return;
  }
  setSelectedModule(module);
  setCourseStep(Math.max(0, Math.min(6, Number(checkpoint.step) || 0)));
  setCourseHighestStep(Math.max(0, Math.min(6, Number(checkpoint.highestStep) || 0)));
  setCourseSubstep(Math.max(0, Number(checkpoint.substep) || 0));
  setCourseAttempt(Math.max(1, Number(checkpoint.attempt) || 1));
  setScreen('course');
}

function PasswordRecoveryScreen({ notice, onSubmit }) {
  function handleSubmit(event) { event.preventDefault(); onSubmit(Object.fromEntries(new FormData(event.currentTarget))); }
  const noticeTone = /^(Las contraseñas no coinciden|La contraseña debe|El enlace venció)/.test(notice) ? 'is-error' : '';
  return <main className="cq-auth-page"><FloatingParticles /><motion.section className="cq-auth-card cq-reset-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}><Brand /><p className="cq-kicker">CUENTA PROTEGIDA</p><h1>Creá una contraseña nueva</h1><p>Elegí una clave de al menos 8 caracteres y confirmala para actualizar tu acceso.</p>{notice && <p className={`cq-notice ${noticeTone}`}>{notice}</p>}<form onSubmit={handleSubmit} className="cq-auth-form"><label>Contraseña nueva<input name="password" type="password" autoComplete="new-password" minLength="8" placeholder="Mínimo 8 caracteres" required /></label><label>Repetí la contraseña nueva<input name="confirmPassword" type="password" autoComplete="new-password" minLength="8" placeholder="Repetí tu contraseña" required /></label><button className="cq-primary" type="submit">Actualizar contraseña <span>→</span></button></form></motion.section></main>;
}

function PointsBadge({ value }) { return <span className="cq-points-badge">🛡️ {value} pts</span>; }

function Header({ totalScore, onHome, onModules, onStats, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="cq-header"><button className="cq-brand-button" onClick={onHome} aria-label="Ir a mis misiones"><Brand /></button><div className="cq-header-actions"><PointsBadge value={totalScore} /><div className="cq-header-menu"><button className="cq-menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}><i /><i /><i /></button>{menuOpen && <motion.div className="cq-account-menu" initial={{ opacity: 0, y: -8, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: .96 }}><button onClick={() => { setMenuOpen(false); onModules(); }}><span>🧭 Misiones</span><b>→</b></button><button onClick={() => { setMenuOpen(false); onStats(); }}><span>📊 Estadísticas</span><b>→</b></button><button className="cq-account-logout" onClick={onLogout}><span>↪</span>Cerrar sesión</button></motion.div>}</div></div></header>;
}

function Brand() { return <span className="cq-brand"><img className="cq-brand-logo" src={logoUrl} alt="" /><strong>Cyber<span>Quest</span></strong></span>; }

function StatisticsPage({ scores, isAdmin, teamProfiles, loading, error, onRefresh, onClose }) {
  const scoreFor = (scoreMap, moduleId) => Math.max(0, Math.min(MODULE_MAX_SCORE, Number(scoreMap?.[moduleId]) || 0));
  const personalModules = courseModules.map((module) => ({ ...module, score: scoreFor(scores, module.id) }));
  const personalTotal = personalModules.reduce((sum, module) => sum + module.score, 0);
  const personalPercent = Math.round((personalTotal / (courseModules.length * MODULE_MAX_SCORE)) * 100);
  const personalBest = [...personalModules].sort((a, b) => b.score - a.score)[0];
  const personalNeed = [...personalModules].sort((a, b) => a.score - b.score)[0];
  const employees = teamProfiles.filter((profile) => profile.role !== 'admin');
  const teamModules = courseModules.map((module) => {
    const total = employees.reduce((sum, profile) => sum + scoreFor(profile.scores, module.id), 0);
    const completed = employees.filter((profile) => scoreFor(profile.scores, module.id) >= PASS_SCORE).length;
    return { ...module, score: employees.length ? Math.round(total / employees.length) : 0, completed };
  });
  const teamPercent = employees.length ? Math.round(teamModules.reduce((sum, module) => sum + module.score, 0) / (courseModules.length * MODULE_MAX_SCORE) * 100) : 0;
  const teamBest = employees.length ? [...teamModules].sort((a, b) => b.score - a.score)[0] : null;
  const teamNeed = employees.length ? [...teamModules].sort((a, b) => a.score - b.score)[0] : null;
  const visibleModules = isAdmin ? teamModules : personalModules;
  const visiblePercent = isAdmin ? teamPercent : personalPercent;
  const heading = isAdmin ? 'Panel de aprendizaje del equipo' : 'Mis estadísticas de aprendizaje';
  const description = isAdmin ? 'Medí el avance de la empresa, identificá fortalezas y detectá en qué temas conviene reforzar la capacitación.' : 'Mirá tu avance por módulo e identificá qué temas ya dominás y cuáles conviene repasar.';
  return <motion.section className="cq-stats-page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}><div className="cq-stats-top"><button className="cq-back" onClick={onClose}>← Mis misiones</button>{isAdmin && <button className="cq-stats-refresh" onClick={onRefresh}>↻ Actualizar datos</button>}</div><header className="cq-stats-hero"><div><p className="cq-kicker">{isAdmin ? 'INTELIGENCIA DE CAPACITACIÓN' : 'SEGUIMIENTO PERSONAL'}</p><h1>{heading}</h1><p>{description}</p></div><div className="cq-progress-ring" style={{ '--progress': `${visiblePercent * 3.6}deg` }}><div><b>{visiblePercent}%</b><span>avance</span></div></div></header>{isAdmin && <div className="cq-team-kpis"><article><span>👥</span><div><b>{employees.length}</b><small>empleados con progreso</small></div></article><article><span>🏆</span><div><b>{teamBest?.title || '—'}</b><small>fortaleza del equipo</small></div></article><article><span>🎯</span><div><b>{teamNeed?.title || '—'}</b><small>tema a reforzar</small></div></article></div>}{loading ? <div className="cq-stats-loading">Actualizando estadísticas del equipo…</div> : error ? <div className="cq-stats-error"><b>No se pudo consultar el equipo.</b><span>{error}</span></div> : <><section className="cq-stats-card"><div className="cq-stats-card-heading"><div><p className="cq-kicker">COMPARATIVA POR MÓDULO</p><h2>{isAdmin ? 'Promedio de dominio del equipo' : 'Tu dominio por módulo'}</h2></div><span>Meta: {PASS_SCORE} / {MODULE_MAX_SCORE} pts</span></div><div className="cq-bar-chart">{visibleModules.map((module) => <div className="cq-bar-row" key={module.id}><div className="cq-bar-label"><span>{module.icon}</span><b>{module.title}</b><em>{module.score} pts</em></div><div className="cq-bar-track"><i className={module.score >= PASS_SCORE ? 'is-passing' : ''} style={{ width: `${Math.max(2, module.score / MODULE_MAX_SCORE * 100)}%` }} /></div>{isAdmin && <small>{module.completed}/{employees.length} aprobó</small>}</div>)}</div></section><section className="cq-stats-insights"><article className="cq-insight-good"><span>✦</span><div><p>{isAdmin ? 'FORTALEZA DE LA EMPRESA' : 'TU MAYOR FORTALEZA'}</p><h3>{(isAdmin ? teamBest : personalBest)?.title || 'Todavía no hay datos'}</h3><small>{isAdmin && !employees.length ? 'Cuando el equipo complete actividades, esta vista mostrará la fortaleza principal.' : isAdmin ? `Promedio: ${teamBest?.score || 0} de ${MODULE_MAX_SCORE} puntos.` : `${personalBest?.score || 0} de ${MODULE_MAX_SCORE} puntos.`}</small></div></article><article className="cq-insight-focus"><span>◎</span><div><p>{isAdmin ? 'OPORTUNIDAD DE MEJORA' : 'PRÓXIMO TEMA A REPASAR'}</p><h3>{(isAdmin ? teamNeed : personalNeed)?.title || 'Todavía no hay datos'}</h3><small>{isAdmin && !employees.length ? 'Cuando existan resultados, este indicador señalará el tema prioritario.' : isAdmin ? `Promedio: ${teamNeed?.score || 0} de ${MODULE_MAX_SCORE} puntos. Una campaña de refuerzo puede mejorar este resultado.` : `${personalNeed?.score || 0} de ${MODULE_MAX_SCORE} puntos. Volvé al módulo para practicarlo.`}</small></div></article></section>{isAdmin && <section className="cq-stats-card cq-employee-card"><div className="cq-stats-card-heading"><div><p className="cq-kicker">VISTA DE PERSONAS</p><h2>Progreso por empleado</h2></div><span>{employees.length} registros</span></div>{employees.length ? <div className="cq-employee-list">{employees.map((profile) => { const total = courseModules.reduce((sum, module) => sum + scoreFor(profile.scores, module.id), 0); const approved = courseModules.filter((module) => scoreFor(profile.scores, module.id) >= PASS_SCORE).length; return <article key={profile.id || profile.email}><div className="cq-employee-avatar">{(profile.name || profile.email || '?').slice(0, 1).toUpperCase()}</div><div><b>{profile.name || 'Sin nombre'}</b><small>{profile.email}</small></div><div className="cq-employee-progress"><b>{total} / 1200 pts</b><span>{approved} de {courseModules.length} módulos aprobados</span></div></article>; })}</div> : <p className="cq-empty-team">Los empleados que se registren y avancen en CyberQuest aparecerán acá con su progreso.</p>}</section>}</>}</motion.section>;
}

function Welcome({ user, onStart }) {
  return <motion.section className="cq-welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><FloatingParticles />
    <div className="cq-welcome-copy"><p className="cq-greeting">¡Bienvenido, {user.name}!</p><p className="cq-kicker">ACADEMIA DIGITAL · EMPRESAS SEGURAS</p><h1>La seguridad se construye en cada decisión.</h1><p className="cq-lead">CyberQuest es una plataforma de capacitación interactiva para reconocer riesgos, proteger información sensible y actuar con seguridad en el trabajo y en la vida diaria.</p><p className="cq-summary"><b>Tu recorrido incluye 6 módulos:</b> contraseñas, email seguro, protección de datos, amenazas cibernéticas, ingeniería social y grooming. En cada uno vas a encontrar contenido guiado, mini desafíos, situaciones reales y trivias.</p><button className="cq-primary" onClick={onStart}>Comenzar desafío <span>→</span></button></div>
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

function rotateItems(items, amount) {
  const normalized = ((amount % items.length) + items.length) % items.length;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

function reorderQuestion(item, attempt = 0, variation = 0) {
  const correctOption = item.options[item.answer];
  const distractors = rotateItems(item.options.filter((_, index) => index !== item.answer), attempt + variation);
  const correctIndex = (attempt + variation) % item.options.length;
  const options = [...distractors];
  options.splice(correctIndex, 0, correctOption);
  return { ...item, options, answer: correctIndex };
}

function CourseFlow({ module, isAdmin, initialRewards, initialStep, initialHighestStep, initialSubstep, initialAnswers, attempt, onStepChange, onSubstepChange, onAnswersChange, onProgress, onClose, onFinish }) {
  const [step, setStep] = useState(() => Math.max(0, Math.min(6, initialStep || 0)));
  const [rewardedActivities, setRewardedActivities] = useState(() => new Set(initialRewards));
  const [score, setScore] = useState(() => Math.min(new Set(initialRewards).size * 20, MODULE_MAX_SCORE));
  const [highestStep, setHighestStep] = useState(() => Math.max(0, Math.min(6, initialHighestStep ?? initialStep ?? 0)));
  const [answers, setAnswers] = useState(() => initialAnswers || {});
  const scenarioIndexes = useMemo(() => {
    const total = module.scenarios.length;
    const first = (attempt - 1) % total;
    return [first, (first + 1) % total];
  }, [module, attempt]);
  const rotatingChallenges = useMemo(() => rotateItems([
    { kind: 'scenario', scenarioIndex: scenarioIndexes[0], label: 'Decidí' },
    { kind: 'scenario', scenarioIndex: scenarioIndexes[1], label: 'Decidí' },
    { kind: 'quiz', questions: module.quizzes.slice(0, 3), prefix: 'quiz', title: 'Trivia', label: 'Trivia' },
    { kind: 'quiz', questions: module.quizzes.slice(3), prefix: 'final-quiz', title: 'Trivia final', label: 'Trivia' }
  ], attempt - 1), [module, attempt, scenarioIndexes]);
  const flow = [{ kind: 'learn', phase: 0, label: 'Aprendé' }, rotatingChallenges[0], { kind: 'learn', phase: 1, label: 'Aprendé' }, rotatingChallenges[1], rotatingChallenges[2], { kind: 'learn', phase: 2, label: 'Aprendé' }, rotatingChallenges[3]];
  const moveToStep = (next) => { const nextHighest = Math.max(highestStep, next); setHighestStep(nextHighest); setStep(next); onStepChange(next, nextHighest); };
  const rememberAnswer = (activityId, answer) => {
    if (Object.prototype.hasOwnProperty.call(answers, activityId)) return;
    const nextAnswers = { ...answers, [activityId]: answer };
    setAnswers(nextAnswers);
    onAnswersChange(nextAnswers);
  };
  const addPoint = (activityId) => {
    if (rewardedActivities.has(activityId)) return;
    const nextRewards = new Set([...rewardedActivities, activityId]);
    setRewardedActivities(nextRewards);
    setScore(nextRewards.size * 20);
    onProgress(module.id, [...nextRewards]);
  };
  const currentItem = flow[step];
  const nextLabel = flow[step + 1]?.label;
  const current = currentItem.kind === 'learn' ? <LearnBlock module={module} phase={currentItem.phase} attempt={attempt} nextLabel={nextLabel} savedAnswer={answers[`learn-${currentItem.phase}`]} onAnswered={(answer) => rememberAnswer(`learn-${currentItem.phase}`, answer)} onCorrect={() => addPoint(`learn-${currentItem.phase}`)} onNext={() => moveToStep(step + 1)} />
    : currentItem.kind === 'scenario' ? <ScenarioBlock scenario={module.scenarios[currentItem.scenarioIndex]} attempt={attempt} variation={currentItem.scenarioIndex} savedAnswer={answers[`scenario-${currentItem.scenarioIndex}`]} onAnswered={(answer) => rememberAnswer(`scenario-${currentItem.scenarioIndex}`, answer)} onCorrect={() => addPoint(`scenario-${currentItem.scenarioIndex}`)} onNext={() => moveToStep(step + 1)} />
      : <QuizBlock questions={currentItem.questions} title={currentItem.title} activityPrefix={currentItem.prefix} attempt={attempt} variation={step} initialIndex={initialSubstep} answers={answers} onIndexChange={onSubstepChange} onAnswered={rememberAnswer} onCorrect={(questionIndex) => addPoint(`${currentItem.prefix}-${questionIndex}`)} onNext={() => step === flow.length - 1 ? onFinish(module.id, score, [...rewardedActivities]) : moveToStep(step + 1)} />;
  return <motion.section className="cq-course" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><button className="cq-back" onClick={onClose}>← Misiones</button><header className="cq-course-header"><span>{module.icon}</span><div><h1>{module.title}</h1><p>{module.subtitle}</p></div><b><PointsBadge value={`${score} / ${MODULE_MAX_SCORE}`} /></b></header><nav className="cq-stepper">{flow.map((item, index) => <button key={`${item.kind}-${index}`} className={index === step ? 'active' : ''} disabled={!isAdmin && index > highestStep} onClick={() => moveToStep(index)}>{index + 1}. {item.label}</button>)}</nav><AnimatePresence mode="wait"><motion.div key={`${step}-${currentItem.kind}-${currentItem.scenarioIndex ?? currentItem.prefix ?? currentItem.phase}`} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -18 }}>{current}</motion.div></AnimatePresence></motion.section>;
}

function LearnBlock({ module, phase, attempt, nextLabel, savedAnswer, onAnswered, onCorrect, onNext }) {
  const [answered, setAnswered] = useState(() => savedAnswer !== undefined);
  const mini = module.minis[(phase + attempt - 1) % module.minis.length];
  const details = phase === 0 ? [module.learn.details[0]] : phase === 1 ? [module.learn.details[1]] : module.learn.details.slice(2);
  const pointGroups = [[0], [1, 2], [3]];
  const title = module.learn.phaseTitles?.[phase] || (phase === 0 ? module.learn.title : phase === 1 ? 'Profundizá el concepto' : 'Llevá el conocimiento a la práctica');
  return <article className="cq-activity"><p className="cq-kicker">CONTENIDO EDUCATIVO · BLOQUE {phase + 1} DE 3</p><h2>{title}</h2>{phase === 0 && <p className="cq-activity-lead">{module.learn.intro}</p>}{details.map((detail) => <p className="cq-detail" key={detail}>{detail}</p>)}<div className="cq-learning-points">{pointGroups[phase].map((index) => module.learn.points[index]).filter(Boolean).map(([title, text]) => <div key={title}><b>{title}</b><span>{text}</span></div>)}</div><QuestionCard eyebrow={<>MINI DESAFÍO <PointsBadge value={20} /></>} item={mini} attempt={attempt} variation={phase} savedAnswer={savedAnswer} onCorrect={onCorrect} onAnswered={(answer) => { onAnswered(answer); setAnswered(true); }} />{answered && <button className="cq-primary" onClick={onNext}>Continuar con {nextLabel} →</button>}</article>;
}

function ScenarioBlock({ scenario, attempt, variation, savedAnswer, onAnswered, onCorrect, onNext }) {
  const [answered, setAnswered] = useState(() => savedAnswer !== undefined);
  const chatMatch = scenario.text.match(/^(.*?te escribe(?: por chat)?):\s*[“"](.+?)[”"]$/);
  const isChat = Boolean(scenario.person && chatMatch);
  const context = chatMatch?.[1] || '';
  const message = chatMatch?.[2] || scenario.text;
  const isEmail = scenario.scene === 'email';
  const isMeeting = scenario.scene === 'meeting';
  const [messageVisible, setMessageVisible] = useState(!isChat);
  useEffect(() => {
    setMessageVisible(!isChat);
    if (!isChat) return undefined;
    const timer = window.setTimeout(() => setMessageVisible(true), 1450);
    return () => window.clearTimeout(timer);
  }, [scenario, isChat]);
  const picture = scenario.visual?.includes('/') ? <img src={scenario.visual} alt={scenario.person || 'Persona de la situación'} /> : <span className={`cq-scenario-emoji ${scenario.visual === '☎️' ? 'is-phone' : ''}`}>{scenario.visual}</span>;
  const avatarClass = `cq-person-avatar ${scenario.visual?.includes('/') ? '' : 'has-emoji'}`;
  const chat = isChat ? <><p className="cq-chat-context">{context}:</p><section className="cq-chat-window"><header><div className={avatarClass}>{picture}</div><div><b>{scenario.person.split(' · ')[0]}</b><small>● En línea</small></div><span>•••</span></header><div className="cq-chat-thread"><time>Ahora</time>{messageVisible ? <motion.p className="cq-chat-message" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{message}<small>✓✓</small></motion.p> : <div className="cq-typing"><i /><i /><i /></div>}</div></section></> : isEmail ? <section className="cq-email-preview"><header><span>✉️</span><div><b>{scenario.email.senderName}</b><small>{scenario.email.sender}</small></div><i>•••</i></header><div className="cq-email-body"><small>PARA VOS · AHORA</small><h3>{scenario.email.subject}</h3><p>{scenario.email.message}</p>{scenario.email.attachment && <span className="cq-email-attachment">📎 {scenario.email.attachment}</span>}</div></section> : isMeeting ? <section className="cq-meeting-scene"><div className="cq-meeting-people">{scenario.people.map((person, index) => <div className="cq-meeting-person" key={person}><img src={person} alt={index === 0 ? 'Integrante del equipo' : 'Persona que solicita acceso'} /></div>)}<span>↔</span></div><div><b>{scenario.person}</b><p>{scenario.text}</p></div></section> : <section className={`cq-dialogue-scene ${scenario.note ? 'has-note' : ''}`}><div className={avatarClass}>{picture}</div><div className="cq-chat-content"><span>{scenario.person || 'Situación para analizar'}</span><p>{scenario.text}</p>{scenario.note && <motion.div className="cq-password-note" initial={{ opacity: 0, rotate: -7, y: 10 }} animate={{ opacity: 1, rotate: -3, y: 0 }}><small>NOTA ENCONTRADA</small><b>{scenario.note}</b></motion.div>}</div></section>;
  return <article className="cq-activity"><p className="cq-kicker">SITUACIÓN COTIDIANA <PointsBadge value={20} /></p><h2>{scenario.title}</h2>{chat}{messageVisible && <QuestionCard item={{ prompt: '¿Qué harías en este caso?', options: scenario.options, answer: scenario.answer, feedback: scenario.feedback }} attempt={attempt} variation={variation} savedAnswer={savedAnswer} onCorrect={onCorrect} onAnswered={(answer) => { onAnswered(answer); setAnswered(true); }} />}{answered && <button className="cq-primary" onClick={onNext}>Continuar →</button>}</article>;
}

function QuizBlock({ questions, title, activityPrefix, attempt, variation, initialIndex, answers, onIndexChange, onAnswered, onCorrect, onNext }) {
  const [index, setIndex] = useState(() => Math.max(0, Math.min(questions.length - 1, initialIndex || 0)));
  const activityId = `${activityPrefix}-${index}`;
  const [answered, setAnswered] = useState(() => Object.prototype.hasOwnProperty.call(answers, activityId));
  const last = index === questions.length - 1;
  function next() { if (last) onNext(); else { const nextIndex = index + 1; setIndex(nextIndex); onIndexChange(nextIndex); setAnswered(Object.prototype.hasOwnProperty.call(answers, `${activityPrefix}-${nextIndex}`)); } }
  return <article className="cq-activity"><p className="cq-kicker">{title.toUpperCase()} · PREGUNTA {index + 1} DE {questions.length} <PointsBadge value={20} /></p><QuestionCard key={questions[index].prompt} item={questions[index]} attempt={attempt} variation={variation + index} savedAnswer={answers[activityId]} onCorrect={() => onCorrect(index)} onAnswered={(answer) => { onAnswered(activityId, answer); setAnswered(true); }} />{answered && <button className="cq-primary" onClick={next}>{last ? 'Ver resultado del módulo →' : 'Siguiente pregunta →'}</button>}</article>;
}

function QuestionCard({ eyebrow, item, attempt = 0, variation = 0, savedAnswer, onCorrect, onAnswered }) {
  const displayedItem = useMemo(() => reorderQuestion(item, attempt, variation), [item, attempt, variation]);
  const restoredAnswer = displayedItem.options.indexOf(savedAnswer);
  const [answer, setAnswer] = useState(() => restoredAnswer >= 0 ? restoredAnswer : null);
  const complete = answer !== null;
  function choose(index) { if (complete) return; setAnswer(index); if (index === displayedItem.answer) onCorrect(); onAnswered(displayedItem.options[index]); }
  return <section className="cq-question-card">{eyebrow && <p className="cq-kicker">{eyebrow}</p>}<h3>{displayedItem.prompt}</h3><div className="cq-options">{displayedItem.options.map((option, index) => <button key={option} disabled={complete} className={complete ? index === displayedItem.answer ? 'correct' : index === answer ? 'wrong' : '' : ''} onClick={() => choose(index)}><b>{String.fromCharCode(65 + index)}.</b> {option}</button>)}</div>{complete && <p className={`cq-feedback ${answer === displayedItem.answer ? 'good' : 'bad'}`}><b>{answer === displayedItem.answer ? '¡Muy bien! ' : 'Para recordar: '}</b>{displayedItem.feedback}</p>}</section>;
}

function HangmanGame({ onClose }) {
  const [conceptIndex, setConceptIndex] = useState(() => {
    const index = nextHangmanConceptIndex % hangmanConcepts.length;
    nextHangmanConceptIndex += 1;
    return index;
  });
  const concept = hangmanConcepts[conceptIndex];
  const [guessed, setGuessed] = useState([]);
  const [errors, setErrors] = useState(0);
  const keyboardRows = ['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM'];
  const letters = keyboardRows.join('').split('');
  const complete = concept.word.split('').every((letter) => guessed.includes(letter));
  const lost = errors >= 5;
  const finished = complete || lost;
  const reveal = (letter) => {
    const normalized = String(letter || '').toUpperCase();
    if (finished || !keyboardRows.join('').includes(normalized) || guessed.includes(normalized)) return;
    setGuessed((current) => [...current, normalized]);
    if (!concept.word.includes(normalized)) setErrors((current) => current + 1);
  };
  const newConcept = () => {
    setConceptIndex((current) => (current + 1) % hangmanConcepts.length);
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
  const [round, setRound] = useState(1);
  const challenges = useMemo(() => rotateItems(signalChallenges, round - 1), [round]);
  const item = challenges[index];
  const isWhatsAppChallenge = item.title === 'Mensaje inesperado';
  const isApprovalChallenge = item.title === 'Inicio de sesión no reconocido';
  const isPendriveChallenge = item.title === 'Pendrive encontrado';
  const defaultWrongOptions = ['Abrirlo o conectarlo para comprobar si realmente hay un problema.', item.thirdOption || 'Esperar, porque si fuera importante alguien volverá a escribir.'];
  const baseOptions = [{ text: item.answer, isCorrect: true }, ...(item.wrongOptions || defaultWrongOptions).map((text) => ({ text, isCorrect: false }))];
  const reorderedOptions = reorderQuestion({ options: baseOptions.map((option) => option.text), answer: 0 }, round, index);
  const options = reorderedOptions.options.map((text, optionIndex) => ({ text, isCorrect: optionIndex === reorderedOptions.answer }));
  const correct = answer !== null && options[answer]?.isCorrect;
  useEffect(() => {
    setMessageVisible(!isWhatsAppChallenge);
    if (!isWhatsAppChallenge) return undefined;
    const timer = window.setTimeout(() => setMessageVisible(true), 1500);
    return () => window.clearTimeout(timer);
  }, [index, isWhatsAppChallenge]);
  const situation = isWhatsAppChallenge
    ? <section className="cq-whatsapp-chat"><header><span>📦</span><div><b>Envíos Express</b><small>número no agendado</small></div><i>•••</i></header><div className="cq-whatsapp-thread"><time>Ahora</time>{messageVisible ? <><motion.p className="cq-whatsapp-message" initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }}>Tu paquete está retenido. Pagá ahora para evitar que sea devuelto.<small>✓✓</small></motion.p><motion.p className="cq-whatsapp-message cq-whatsapp-link" initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .45 }}>🔗 envios-express-seguimiento.example/activar<small>✓✓</small></motion.p></> : <div className="cq-whatsapp-typing"><i /><i /><i /></div>}</div></section>
    : isApprovalChallenge ? <section className="cq-phone-scene"><motion.div className="cq-real-phone" initial={{ opacity: 0, y: 15, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }}><img src={`${import.meta.env.BASE_URL}security-notice-phone.png`} alt="Una persona sostiene un celular que muestra una alerta de seguridad" /><div className="cq-real-phone-notice"><div className="cq-real-phone-status"><span>9:41</span><b>● ● ●</b></div><header><span>🛡️</span><div><b>Aviso de seguridad</b><small>Ahora</small></div></header><div className="cq-real-phone-message"><motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25 }}>Detectamos un inicio de sesión en tu cuenta desde un dispositivo nuevo.</motion.p><motion.div className="cq-approval-request" initial={{ opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .55 }}><b>¿Reconocés esta actividad?</b><span>Si fuiste vos, desestimá este aviso. Si no fuiste vos, revisá la seguridad desde la app oficial.</span><div><button>No fui yo</button><button>Fui yo</button></div></motion.div></div></div></motion.div></section>
    : isPendriveChallenge ? <motion.figure className="cq-pendrive-photo" initial={{ opacity: 0, scale: .985 }} animate={{ opacity: 1, scale: 1 }}><img src={`${import.meta.env.BASE_URL}found-pendrive-office.png`} alt="Una mujer alcanza un pendrive sin identificar en el piso de una oficina" /><figcaption>Una empleada encuentra un pendrive sin identificar en el piso de la oficina.</figcaption></motion.figure>
    : <section className="cq-signal-situation"><span>💬</span><p>{item.text}</p></section>;
  const continueGame = () => {
    if (index === challenges.length - 1) setFinished(true);
    else { setIndex((current) => current + 1); setAnswer(null); }
  };
  const restart = () => { setRound((current) => current + 1); setIndex(0); setAnswer(null); setScore(0); setFinished(false); };
  if (finished) return <section className="cq-game-page"><button className="cq-back" onClick={onClose}>← Mis misiones</button><motion.article className="cq-game-result" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }}><span>🔎</span><p className="cq-kicker">MIRADA ENTRENADA</p><h1>{score} de {challenges.length} señales resueltas</h1><p>{score === challenges.length ? 'Reconociste cuándo conviene frenar y verificar. Esa pausa puede evitar muchos engaños.' : 'Frente a la urgencia o a algo inesperado, frená, verificá por un canal conocido y pedí ayuda.'}</p><div><button className="cq-primary" onClick={restart}>Jugar de nuevo →</button><button className="cq-secondary" onClick={onClose}>Volver a misiones</button></div></motion.article></section>;
  return <section className="cq-game-page"><button className="cq-back" onClick={onClose}>← Misiones</button><header className="cq-game-header"><span>🔎</span><div><p className="cq-kicker">MINIJUEGO INTERACTIVO · {index + 1} DE {challenges.length}</p><h1>Detectá las señales</h1><p>Observá la situación y elegí la respuesta más segura.</p></div></header><motion.article key={item.title} className="cq-signals-card" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}><h2>{item.title}</h2>{situation}<p className="cq-kicker">SEÑALES PARA DETECTAR</p><div className="cq-signal-list">{item.signals.map((signal, signalIndex) => <motion.div key={signal} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: signalIndex * .12 }}><small>SEÑAL N.º {signalIndex + 1}</small><b>{signal}</b></motion.div>)}</div><h3>¿Cuál es la respuesta más segura?</h3><div className="cq-options">{options.map((option, optionIndex) => <button key={option.text} disabled={answer !== null} className={answer !== null ? option.isCorrect ? 'correct' : optionIndex === answer ? 'wrong' : '' : ''} onClick={() => { setAnswer(optionIndex); if (option.isCorrect) setScore((current) => current + 1); }}><b>{String.fromCharCode(65 + optionIndex)}.</b> {option.text}</button>)}</div>{answer !== null && <motion.div className={`cq-feedback ${correct ? 'good' : 'bad'}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><b>{correct ? '¡Bien visto! ' : 'Para recordar: '}</b>{item.answer}</motion.div>}{answer !== null && <button className="cq-primary cq-next-game" onClick={continueGame}>{index === challenges.length - 1 ? 'Ver resultado →' : 'Siguiente situación →'}</button>}</motion.article></section>;
}

function FinalChallenge({ attempt, onClose }) {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const questions = useMemo(() => rotateItems(finalQuestions, attempt - 1), [attempt]);
  const item = questions[index];
  function next() { if (index === questions.length - 1) setFinished(true); else { setIndex((current) => current + 1); setAnswered(false); } }
  if (finished) return <section className="cq-course"><button className="cq-back" onClick={onClose}>← Misiones</button><article className="cq-activity cq-result"><span>🏆</span><p className="cq-kicker">RESULTADO INTEGRAL</p><h1>{correct} de {questions.length} respuestas correctas</h1><p>{correct >= 8 ? 'Excelente desempeño: aplicaste prácticas seguras en la mayoría de las situaciones.' : 'Repasá los módulos que te resultaron más difíciles. Cada intento fortalece tus decisiones cotidianas.'}</p><button className="cq-primary" onClick={onClose}>Volver a mis módulos →</button></article></section>;
  return <section className="cq-course"><button className="cq-back" onClick={onClose}>← Misiones</button><header className="cq-course-header"><span>🏆</span><div><h1>Desafío final</h1><p>Una evaluación integral de los seis módulos.</p></div></header><article className="cq-activity"><p className="cq-kicker">EVALUACIÓN INTEGRAL · {index + 1} DE {questions.length}</p><QuestionCard key={item.prompt} item={item} attempt={attempt} variation={index} onCorrect={() => setCorrect((value) => value + 1)} onAnswered={() => setAnswered(true)} />{answered && <button className="cq-primary" onClick={next}>{index === questions.length - 1 ? 'Ver resultado final →' : 'Siguiente desafío →'}</button>}</article></section>;
}

createRoot(document.getElementById('root')).render(<App />);
