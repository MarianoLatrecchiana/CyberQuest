# CyberQuest

CyberQuest es una herramienta de concientización en ciberseguridad para personas particulares y equipos de cualquier organización. Combina explicaciones en lenguaje simple, conversaciones, decisiones, trivias y minijuegos.

## Experiencia de aprendizaje

- **Seis misiones:** Contraseñas, Correo personal / corporativo, Protección de datos, Amenazas cibernéticas, Ingeniería social y Grooming.
- **Contenido guiado:** cada tema se presenta en bloques breves y claros, sin requerir conocimientos técnicos.
- **Situaciones cotidianas:** conversaciones y decisiones aplicables tanto a la vida personal como al trabajo.
- **Práctica constante:** mini desafíos, trivias, el ahorcado ciberseguro y el juego *Detectá las señales*.
- **Progreso gamer:** módulos bloqueados, disponibles o superados; puntos y desbloqueo secuencial.
- **Evaluación integral:** reúne los seis temas y se habilita al aprobar las seis misiones y llegar a 840 puntos.
- **Puntaje equilibrado:** cada módulo tiene diez instancias puntuables de 20 puntos (máximo 200). Se aprueba con 140 puntos, por lo que admite hasta tres errores sin volver el recorrido demasiado fácil.

## Aplicación instalable

La aplicación es una **PWA** (aplicación web instalable). Desde [GitHub Pages](https://marianolatrecchiana.github.io/CyberQuest/) se puede instalar sin pasar por una tienda:

- En **Android/Chrome**, usar el menú del navegador y elegir *Instalar aplicación* o *Agregar a pantalla de inicio*.
- En **iPhone/Safari**, usar *Compartir* y luego *Agregar a pantalla de inicio*.
- En **PC**, Chrome o Edge muestran el botón de instalación en la barra de direcciones o en su menú.

Al instalarla, CyberQuest queda con su ícono propio y se abre como una aplicación independiente. El archivo `manifest.webmanifest` define su identidad instalable y `sw.js` conserva la interfaz básica disponible incluso si la conexión falla.

## Estructura actual

- `index.html`: entrada de la aplicación React.
- `src/main.jsx`: pantallas de acceso, bienvenida, tablero, recorrido de aprendizaje y evaluación final.
- `src/course-data.js`: textos, desafíos, decisiones y trivias de los seis módulos.
- `src/overrides.css`: identidad visual adaptable, partículas, transiciones y estados de las misiones.
- `js/app.js`: versión anterior conservada como referencia durante la migración.
- `package.json` y `vite.config.js`: configuración de React, Vite y Framer Motion.
- `manifest.webmanifest`: nombre, ícono y comportamiento de la aplicación instalada.
- `sw.js`: soporte offline de la PWA.
- `server.js`: opción local para registro, inicio de sesión y perfil administrador.

## Diseño y recorrido React

La interfaz fue migrada a **React + Vite + Framer Motion**. El código separa datos de contenido, navegación y componentes visuales para que sea fácil de mantener y ampliar. Se mantienen los tres bloques “Aprendé”, las dos decisiones y las dos trivias de cada módulo, con un diseño más visual: conversaciones, tarjetas de misión, transiciones, partículas y una animación interactiva de seguridad.

Para verla localmente durante el desarrollo:

```powershell
npm run dev
```

## Progreso y recompensas

- Con Supabase configurado, las cuentas, los puntajes y las misiones aprobadas quedan asociados al usuario online y se recuperan desde cualquier dispositivo.
- Cada desafío solo puede entregar su recompensa una vez. Se puede volver a responder para repasar el feedback, pero no acumular puntos indefinidamente.
- Todos los puntajes usan la misma pastilla visual con escudo para que las recompensas se reconozcan de inmediato.

## Ajustes de contenido recientes

- **Contraseñas:** explicación ampliada de MFA, pregunta de filtración personal actualizada y una situación visual de nota con contraseña expuesta.
- **Correo personal / corporativo:** textos simplificados, opciones de verificación de enlaces ajustadas y avatares de personajes incluidos en la compilación pública.

## Cuentas y datos

La autenticación online usa **Supabase Auth**: las contraseñas no se guardan en el navegador ni en el repositorio. El perfil de cada persona conserva sus puntajes y recompensas en la tabla protegida `profiles`.

### Configuración inicial de Supabase

1. Creá un proyecto en [Supabase](https://supabase.com/).
2. En **SQL Editor**, ejecutá el contenido de `supabase/schema.sql`.
3. En **Project Settings → API**, copiá la URL del proyecto y la clave pública `anon`.
4. Para desarrollo local, copiá `.env.example` a `.env` y completá `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Para GitHub Pages, en el repositorio abrí **Settings → Secrets and variables → Actions** y creá los secretos `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` con esos mismos valores. El flujo de publicación ya los incorpora al generar la aplicación.

Si querés que las cuentas entren inmediatamente después de registrarse, desactivá la confirmación por correo en **Authentication → Providers → Email** mientras estén haciendo pruebas. Para que una cuenta sea administradora, registrala primero y luego ejecutá la última instrucción comentada en `supabase/schema.sql`.

## Publicación

Para publicar los cambios en el repositorio:

```powershell
git -C .\CyberQuest add .
git -C .\CyberQuest commit -m "Actualizo CyberQuest"
git -C .\CyberQuest push origin main
```

GitHub Pages puede tardar unos minutos en actualizarse. Para que la instalación PWA aparezca, abrir la página con HTTPS y actualizarla una vez tras la publicación.
