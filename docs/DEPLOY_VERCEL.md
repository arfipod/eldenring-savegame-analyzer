# Despliegue en Vercel

## Desde GitHub

1. Crea un repositorio y sube el contenido de esta carpeta.
2. En Vercel, selecciona **Add New → Project** e importa el repositorio.
3. Framework preset: **Vite**.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Node.js: 22.x.
7. No añadas variables de entorno.
8. Despliega y prueba una copia de seguridad de un save, nunca la única copia.

## Verificación posterior

- La portada debe indicar “Procesado local” y “Solo lectura”.
- Abre DevTools → Network: al seleccionar un save no debe aparecer ninguna petición con su contenido.
- Solo deben verse recursos de la propia web y peticiones GET a catálogos estáticos en `raw.githubusercontent.com`.
- Comprueba la exportación predeterminada buscando el Steam ID y el MD5 mostrado en la pestaña técnica: ninguno debe estar presente.
- Activa el modo completista solo en una partida donde los spoilers no importen.

## Cabeceras

`vercel.json` impide framing, restringe capacidades del navegador y limita las conexiones de red a la propia aplicación y a los catálogos fijados.
