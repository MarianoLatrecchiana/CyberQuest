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

## Cuentas y datos

En esta versión React, las cuentas de demostración se guardan solo en el navegador del usuario. La cuenta de revisión es `admin@cyberquest.com` con contraseña `admin123`; tiene todas las misiones y la evaluación integral desbloqueadas. Para una implementación real, las contraseñas deben administrarse exclusivamente desde un servidor con hashes, nunca como texto legible en el navegador.

## Publicación

Para publicar los cambios en el repositorio:

```powershell
git -C .\CyberQuest add .
git -C .\CyberQuest commit -m "Actualizo CyberQuest"
git -C .\CyberQuest push origin main
```

GitHub Pages puede tardar unos minutos en actualizarse. Para que la instalación PWA aparezca, abrir la página con HTTPS y actualizarla una vez tras la publicación.
