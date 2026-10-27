# Prueba de alta frecuencia

Rama: `experimento/alta-frecuencia`.

Abrí `alta-frecuencia.html` desde el servidor del proyecto. El inicio del prototipo también tiene un acceso a esta prueba.

## Probar en la computadora

```sh
npm test
npm run preview
```

Abrí http://127.0.0.1:5178/alta-frecuencia.html. La prueba digital genera audio PCM, aplica el filtro de Web Audio y recupera el texto con Goertzel y CRC. El WAV descargado también puede importarse. Esto verifica el recorrido digital; no acredita el canal acústico entre dos teléfonos.

## Probar con dos iPhone

1. Serví esta rama por HTTPS y abrí su página `alta-frecuencia.html` en Safari en ambos teléfonos. Al publicar esta rama, el workflow de Pages prepara la versión de `main` en la raíz y esta prueba en `/alta-frecuencia/alta-frecuencia.html`. La URL de GitHub muestra código, no ejecuta la aplicación; esperá a que el workflow termine correctamente antes de usar el enlace Pages.
2. Seleccioná **Alta · 18.500 / 19.500 Hz** en los dos. Usá parlante y micrófono integrados, pantalla abierta, sin auriculares y volumen moderado. Empezá con los teléfonos a 20–50 cm; es una condición de ensayo, no un alcance verificado.
3. En el receptor, activá el micrófono. En el emisor, probá el tono 0 y el tono 1: debería subir el indicador correspondiente del receptor.
4. Enviá «Hola». El receptor sólo mostrará el mensaje si el CRC del paquete coincide. Si falla, repetí el envío.
5. Repetí en modo **Audible** con la misma distancia. Si funciona audible y no alta, investigá la respuesta del parlante, micrófono o procesamiento del navegador.
6. Registrá modelos, versión de iOS, distancia, orientación, volumen, banda, frecuencia de muestreo, intentos y mensajes recuperados. Un resultado en un modelo no garantiza compatibilidad con todos.

## Diseño de este ensayo

| Parámetro | Valor |
| --- | --- |
| Modulación | FSK binaria, fase continua |
| Frecuencias altas | 18.500 y 19.500 Hz |
| Comparación audible | 1.200 y 2.200 Hz |
| Duración de bit | 20 ms, 50 bit/s brutos |
| Muestreo | El real del AudioContext; probado digitalmente a 48.000 y 44.100 muestras/s |
| Filtro de banda alta | Biquad pasaaltos a 18 kHz seguido de pasabajos a 20 kHz |
| Sincronización | Preámbulo alternado de 48 bits, marcador 0xD391C5A7 de 32 bits, ocho hipótesis temporales |
| Detección | Goertzel en ambas frecuencias, ventana Hann sobre el 60 % central de cada bit |
| Paquete | Versión 1 byte + longitud 1 byte + texto UTF-8 hasta 80 bytes + CRC-32 4 bytes |
| CRC | CRC-32/ISO-HDLC, variante ya usada por el proyecto, sobre versión, longitud y texto |
| Corrección | Este ensayo no implementa Reed-Solomon; ante error se repite el envío |

La tasa útil es menor que 50 bit/s por la sincronización y el CRC. Una frecuencia acústica mayor no aumenta por sí sola la cantidad de datos transmitidos. El filtro atenúa componentes exteriores a la banda y no elimina interferencias que compartan las frecuencias útiles. Las rampas de amplitud al comenzar y finalizar reducen los transitorios.

Los niveles mostrados son estimaciones de energía de los tonos en dBFS después del filtro, no una medición calibrada de SNR o presión sonora. Se solicita desactivar cancelación de eco, supresión de ruido y ganancia automática; el navegador puede limitar el control. Los tonos pueden ser audibles para algunas personas.

Se conservaron el prototipo original y sus licencias. El módem de este ensayo está implementado en JavaScript y tiene un formato propio; no es compatible con los WAV del prototipo ggwave.

## Pruebas y límites

`tests/high-frequency.test.mjs` comprueba recuperación de UTF-8 desde PCM, ambas frecuencias, temporización no alineada, 44,1/48 kHz, límite de bytes, paquetes consecutivos, ruido reproducible, rechazo CRC y recuperación después de un paquete dañado. Las pruebas de navegador verifican además los filtros reales de Web Audio, WAV, micrófono simulado y caché offline. Falta medir el enlace físico entre iPhone.

La web se procesa localmente, y el service worker incluye la página de prueba y sus recursos. La primera descarga y el permiso del micrófono requieren un origen seguro; el uso offline debe verificarse en los iPhone disponibles.

El despliegue es un único artefacto de Pages. Una publicación posterior desde `main` puede retirar la subcarpeta experimental; otro despliegue desde esta rama la vuelve a incluir. Publicar esta rama no modifica los commits de `main`.

Fuentes: [Goertzel, Texas Instruments SPRA096A](https://www.ti.com/lit/an/spra096a/spra096a.pdf), [filtros Web Audio, W3C](https://www.w3.org/TR/webaudio/#BiquadFilterNode), [estudio de transmisión de alta frecuencia en teléfonos, incluidos iPhone](https://pmc.ncbi.nlm.nih.gov/articles/PMC6603536/).
