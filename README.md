# ProyectoComunicaciones

## SonicDrop: comunicación de datos por sonido

Prototipo académico de una web que transforma texto y miniaturas en sonido y permite reconstruirlos en otro dispositivo mediante su micrófono. El motor ggwave y todos los recursos están incluidos localmente. El contenido se procesa en el navegador y no se envía a un servidor.

## Objetivo

Explorar un canal de comunicación entre dispositivos cercanos en lugares sin conectividad, y ofrecer una herramienta visual para estudiar cómo el ruido afecta la recepción. El caso de referencia es compartir datos breves durante actividades en un parque nacional.

## Implementado

- Envío y recepción de textos de hasta 400 bytes UTF-8.
- Miniaturas de hasta 48 píxeles por lado y 8 colores. La vista previa muestra la imagen que se transmitirá.
- División en bloques, recepción de bloques fuera de orden y verificación CRC-32 del contenido completo.
- Conservación de bloques para completar la recepción al repetir la misma transmisión.
- Exportación de audio WAV y decodificación de WAV guardados con el mismo motor acústico.
- Recursos locales y service worker para preparar el uso offline.

## Próxima etapa

- Laboratorio de SNR con ruido controlado, escucha del audio y comparación de mensajes recuperados.
- Explicación interactiva de la modulación, el espectro y la recuperación del contenido.
- Estimación orientativa de SNR del micrófono, diferenciada de la SNR conocida del laboratorio.
- Pruebas físicas entre dos iPhone y verificación del uso offline en Safari.

## Alcance

Los dispositivos deben estar físicamente cerca y mantener la web abierta. La primera carga requiere internet. El uso offline posterior depende de conservar la caché y debe comprobarse en los dispositivos de prueba.

Las imágenes se reducen a miniaturas. No se transfiere la fotografía original ni se promete una distancia o velocidad garantizada. El objetivo inicial es el intercambio de datos cortos y el estudio del canal acústico.

## Publicación

El proyecto está preparado para GitHub Pages mediante `.github/workflows/pages.yml`. Publica `dist` y ejecuta antes las pruebas de protocolo y audio. La primera vez debe habilitarse **Settings > Pages > GitHub Actions**.

Dirección prevista después del primer despliegue exitoso: https://fabricalliari.github.io/ProyectoComunicaciones/

Consultá [las instrucciones de publicación y prueba](docs/GITHUB-PAGES.md). El enlace previsto no acredita que el despliegue haya terminado.

## Desarrollo local

Requiere Node.js 20 o superior. No necesita instalar dependencias.

```text
node --test tests/protocol.test.mjs tests/audio.test.mjs
node serve.mjs
```

La web estará en http://127.0.0.1:5178/. Para habilitar el micrófono en iPhone, usá el sitio HTTPS publicado.

## Base técnica

La aplicación incluye ggwave 0.4.0 con su licencia MIT. Utiliza el perfil audible FAST, modulación FSK y la corrección de errores integrada de la biblioteca. SonicDrop agrega cabeceras de 18 bytes y fragmentos de hasta 110 bytes, para un máximo de 128 bytes por bloque acústico.

El contenido de imagen usa una paleta adaptativa de hasta 8 colores, índices de 3 bits o compresión de rachas. El receptor conserva los bloques y muestra el contenido cuando su CRC coincide.

Se verificó el ciclo digital de datos a audio FSK y vuelta a datos, incluidas imágenes y adaptación de 44,1 a 48 kHz. Eso no sustituye las pruebas acústicas entre teléfonos.

## Referencias

- [ggwave y descripción del protocolo](https://github.com/ggerganov/ggwave).
- [Licencia y atribución](THIRD-PARTY-NOTICES.md).
- [GitHub Pages con GitHub Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
