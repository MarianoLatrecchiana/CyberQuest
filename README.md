# CyberQuest

Herramienta educativa estática para concientización de equipos que trabajan con información sensible. No usa frameworks, servidor ni datos externos: basta abrir `index.html` en un navegador.

## Arquitectura y flujo

```
Inicio / tablero
  ├─ Módulos (Contraseñas, Datos, Grooming y Correo)
  │    ├─ Contenido educativo
  │    ├─ Situación de trabajo con decisión y devolución
  │    └─ Trivia de opción múltiple
  └─ Desafío: Ahorcado de ciberseguridad
```

- **`index.html`**: estructura de la interfaz y pantallas.
- **`css/styles.css`**: identidad visual, diseño adaptable y estados de juego.
- **`js/app.js`**: catálogo de contenidos, estado del usuario y renderizado de cada actividad.

El catálogo `modules` dentro de `js/app.js` concentra cada módulo. Para ampliar la herramienta solo se agregan objetos de contenido, situaciones o preguntas, sin cambiar la lógica de pantallas. El estado se conserva mientras la pestaña permanece abierta y puede reiniciarse desde el tablero.

## Cuentas y verificación por email

El servidor nativo `server.js` incorpora registro, inicio de sesión, verificación de correo mediante Resend y una cuenta Admin. Copiar `.env.example` a `.env`, completar la clave de Resend, el remitente con dominio verificado y las credenciales del administrador. Luego ejecutar `node server.js` y abrir `http://localhost:3000`.

El rol Admin tiene todos los módulos habilitados y puede pulsar cualquier paso del recorrido para saltear actividades durante una revisión.

## Uso

Abrir `index.html` en el navegador. Para compartirla, copiar los tres archivos/carpetas manteniendo la estructura.

## Versión para presentar

La herramienta funciona también al abrir `index.html` directamente, sin instalar Node ni configurar correo. En ese modo, las cuentas son de demostración y se guardan únicamente en el navegador de cada persona. Para compartirla, enviar el archivo `CyberQuest-presentacion.zip`; el destinatario debe descomprimirlo y abrir `index.html`.
