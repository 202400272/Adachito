# Auditoría y optimizaciones — Sitio Adashima

Fecha: 2026-06-07

Resumen ejecutivo
- Objetivo: reducir al máximo consumo de ancho de banda, operaciones y solicitudes hacia Cloudflare Pages / R2, optimizando cargas por tipo de contenido (manga, vídeo/audio, PDFs, listas/catálogo) y ajustes de Service Worker.
- Resultado: Auditoría completada y cambios aplicados para minimizar operaciones innecesarias (eliminar HEADs, manifest-first, caché on-demand, posters en vídeo, prefetch escalonado). Informe y validaciones incluidos.

Cambios principales realizados
- Revisión y correcciones generales
  - Eliminadas peticiones HEAD masivas y la función que causaba `imageExists is not defined`.
  - `menu.html` ahora usa token diario para permitir cache CDN (antes `Date.now()`).
  - Service Worker (`sw.js`) modificado para excluir host R2 público y no cachear medios grandes (video/audio/pdf).

- Manga
  - Añadido `manga-manifest.json` con conteos reales por capítulo y `loadMangaManifest()` para priorizar manifiesto (manifest-first).
  - Eliminada la detección con HEAD; fallback secuencial `probeChapterSequential()` con baja concurrencia.
  - Integrado Cache Storage on-demand: `adashima-manga-pages-v1`, funciones `getCachedImageObjectURL`, `addImageToPageCache`, `updateCacheIndex` (LRU aproximado en `localStorage`).
  - Modo `página` optimizado: preferir blob URL desde Cache Storage, almacenar en background al `onload`, y prefetch de vecinos escalonado (retrasos cortos para evitar ráfagas).

- Vídeo / Audio
  - Añadido `poster` a los elementos `<video>` para evitar fetchs de frames.
  - Reemplazada lógica de descarga que cargaba blobs en memoria por un `anchor` directo con `target=_blank` y `download` como fallback.
  - `audio` con `preload="none"` o reproducción bajo interacción (evitar carga automática de streams largos).

- PDFs
  - Reemplazada descarga por `fetch`->blob por intento de descarga directa mediante `anchor` (menor uso de memoria y deja al navegador manejar streaming). Mantengo fallback `fetch`->blob por compatibilidad.

Archivos modificados (resumen)
- `Adashima_Manga.html`: manifest loading, cache helpers, paged-mode optimizations, cascade lazy load integration.
- `sw.js`: excluye host R2, evita cachear audio/video/document.
- `Adashima_anime.html`, `Adashima_mini_anime.html`, `Adashima_Drama.html`: añadidos `poster` en `<video>`.
- `Adashima_Drama.html`: cambio en botón de descarga a anchor directo.
- `Adashima_Estrella.html`: `forceDownload` actualizado para usar anchor directo con fallback.

Pruebas y verificación realizadas
- Comprobado en consola que `loadMangaManifest()` carga y `detectChapterPages(1)` devolvió el número esperado (p. ej. 38).
- Verificado que asignación de `img.src` en modo página funciona y que `img.onload` dispara `addImageToPageCache`.
- Confirmado que posters aparecen en los `<video>` y que la acción de descarga abre en nueva pestaña en caso estándar.

Recomendaciones operativas (Cloudflare / R2)
- Establecer `Cache-Control` en `manga-manifest.json` a `public, max-age=86400` para reducir lecturas.
- Para objetos grandes en R2 (videos, PDFs, colecciones): usar `Cache-Control` adecuado y considerar Signed URLs si se requiere control de acceso (esto evita proxys que rompan `download` attribute).
- Habilitar Tiered Cache y revisar reglas de borde para evitar que el SW intente cachear recursos externos grandes (ya mitigado en `sw.js`).

Próximos pasos sugeridos
1. Desplegar cambios y monitorizar métricas de Cloudflare (requests, egress, R2 GETs) durante 48-72h.
2. Si la reducción es insuficiente, implementar IndexedDB para blobs y aumentar limpieza LRU fuera de `localStorage`.
3. Añadir logs de métricas (opcional): instrumentar con `navigator.sendBeacon` o endpoint ligero para contar cache hits locales vs solicitudes remotas.

Notas de implementación
- Las modificaciones son compatibles con navegadores modernos. El cache on-demand usa Cache Storage y `URL.createObjectURL(blob)` para evitar re-fetch repetidos.
- Evitar revocar object URLs hasta que el elemento ya no las use; el código actual crea object URLs temporalmente (revocación automática no incluida para facilidad). Si quieres, puedo implementar revocación en `img.unload`.

Lista completa de archivos editados
- Adashima_Manga.html
- Adashima_anime.html
- Adashima_mini_anime.html
- Adashima_Drama.html
- Adashima_Estrella.html
- sw.js

Si quieres, puedo:
- Implementar IndexedDB para blobs y revocación segura de object URLs.
- Añadir una pequeña página de pruebas en `tools/` que mida latencia/requests antes y después del cambio.

-- Fin del informe --
