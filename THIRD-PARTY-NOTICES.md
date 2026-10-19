# Componentes de terceros

SonicDrop utiliza [ggwave](https://github.com/ggerganov/ggwave), de Georgi Gerganov, como motor de comunicación acústica. La copia JavaScript/WebAssembly incluida corresponde al paquete 0.4.0 y conserva su licencia MIT en `dist/vendor/LICENSE-ggwave.txt`.

ggwave genera y decodifica las formas de onda mediante FSK y corrección de errores Reed-Solomon. Este proyecto agrega la interfaz, la preparación de miniaturas, la división del contenido en bloques, el ensamblado y la verificación CRC-32.

El laboratorio interactivo de SNR forma parte de la propuesta de ampliación y todavía no está implementado.
