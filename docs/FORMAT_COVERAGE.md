# Cobertura del formato de partida

## Contenedor global

| Área | Estado | Observaciones |
|---|---|---|
| Firma `BND4` | Verificado | Rechazo inmediato si no coincide. |
| Cabecera y offsets de ranura | Verificado | 10 ranuras de tamaño fijo. |
| `UserData10` | Verificado | Steam ID global, perfiles activos, nombre, nivel y tiempo. |
| Checksum de ranura | Verificado | MD5 almacenado frente a los 0x280000 bytes de datos. |

## Ranura de personaje

| Grupo | Estado | Datos principales |
|---|---|---|
| Versión y mapa | Verificado | Versión interna y cuatro bytes de mapa. |
| `GaItem` | Verificado/variable | Handles, IDs, asociación con ceniza de guerra. |
| `PlayerGameData` | Verificado | Atributos, recursos, nivel, runas, clase, nombre, frascos, online y DLC. |
| Equipo | Verificado | Manos, armadura, talismanes, munición y ranuras activas. |
| Inventario y baúl | Verificado | Objetos comunes y clave, cantidades e índices. |
| Magia, bolsa y acceso rápido | Verificado | Hechizos y handles de objetos. |
| Gestos y proyectiles | Verificado | Equipados, desbloqueados y adquiridos. |
| Físico Maravilloso | Verificado | Dos handles de lágrimas. |
| Regiones y gracia | Verificado | Regiones desbloqueadas y última gracia. |
| Montura | Verificado parcialmente | Posición, estado y PV; varios bytes siguen opacos. |
| Muertes y mancha de sangre | Verificado | Recuento, runas, mapa y posición. |
| Posición del jugador | Verificado | Coordenadas, mapa y ángulo; privadas por defecto. |
| Hora/clima | Verificado parcialmente | Hora y campos básicos de clima. |
| Banderas de evento | Preservado y consultable | Bitfield completo; se resuelven solo IDs catalogados. |
| Efectos especiales | Verificado estructuralmente | IDs y duración; nombres no siempre disponibles. |
| Bloques online, tutoriales y sistema | Indexados/opacos | Longitud, offset y vista previa; sin semántica inventada. |

## Semántica

La lectura binaria y la resolución de nombres son capas distintas:

1. El parser obtiene el valor exacto y conserva el ID.
2. La capa semántica busca el ID en un catálogo.
3. Cuando existe una ficha enriquecida, añade resumen funcional, descripción, categoría, rareza y límites de almacenamiento.
4. Si no existe, muestra `ID 0x…` con confianza `raw-id-only`.
5. Una actualización del catálogo puede mejorar nombres sin cambiar el parser.

## Banderas de evento

El índice usa bloques de 1.000 flags y un mapa BST comunitario. Dentro de cada bloque se aplican bytes de 125 posiciones y bits en orden MSB-first. Si el bloque no está catalogado o queda fuera del bitfield, el resultado es `null`, no `false`.

## Versionado y compatibilidad futura

La versión del esquema exportado es independiente de la versión interna del save. Los cambios incompatibles deben incrementar el sufijo del esquema (`semantic.v2`, por ejemplo). Una versión de juego más reciente que el rango validado genera una advertencia; nunca activa escritura o reparación automática.
