# Publicación en GitHub Pages

Repositorio: https://github.com/fabricalliari/ProyectoComunicaciones

La carpeta `dist` contiene la web completa. Las rutas son relativas para admitir el prefijo `/ProyectoComunicaciones/`. El flujo `.github/workflows/pages.yml` ejecuta las pruebas de protocolo y audio y publica únicamente esa carpeta.

## Primera publicación

1. Subí el código a `main` con una cuenta que tenga permisos de escritura.
2. En el repositorio, entrá a **Settings > Pages > Build and deployment** y seleccioná **GitHub Actions** como origen. No hace falta configurar un dominio propio.
3. Entrá a **Actions > Publicar SonicDrop en GitHub Pages > Run workflow** y elegí `main`. Los siguientes cambios en `main` se publicarán automáticamente.
4. Esperá a que los trabajos `verify` y `deploy` terminen correctamente. Abrí la dirección que devuelve el despliegue.

La dirección prevista es https://fabricalliari.github.io/ProyectoComunicaciones/. Esa dirección solo se considera publicada después de un despliegue exitoso y una respuesta HTTPS correcta.

## Prueba con dos dispositivos

Abrí el enlace en Safari en ambos iPhone y esperá a que el motor de audio esté listo. En uno elegí **Recibir** y **Activar micrófono**. En el otro seleccioná **Texto**, escribí un mensaje breve y presioná **Transmitir por sonido**.

Mantenelos cerca, inicialmente a unos 20–50 cm, con la web visible y sin auriculares. El mensaje viaja por sonido. Después de comprobar el texto, probá una miniatura.

La primera carga usa internet. El motor procesa los datos localmente. La prueba física y el funcionamiento offline en iPhone todavía requieren validación.

## Ejecución local

```text
node --test tests/protocol.test.mjs tests/audio.test.mjs
node serve.mjs
```

`http://127.0.0.1:5178/` permite probar el prototipo en la computadora. Una dirección HTTP de la red local no habilita el micrófono en un iPhone. Para los celulares usá HTTPS.

## Referencia

https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
