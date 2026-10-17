# Whois

## Descripción

Esta integración sigue la caducidad de sus nombres de dominio en Gladys: los días que quedan antes de que caduque cada dominio, su fecha de caducidad, su registrador y su estado. Cada dominio se comprueba una vez al día con su registro, mediante RDAP (el sucesor de whois) o, para las extensiones sin RDAP, mediante whois. Un dominio olvidado detiene su web y su correo el día que caduca: las escenas le avisan semanas antes.

![El widget de dominios: la caducidad más próxima primero, con los días restantes (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-whois/main/docs/assets/widgets.es.png)

Esta integración comunitaria no está afiliada a ningún registro ni registrador.

## Requisitos

- Gladys Assistant 5.1.0 o posterior.
- Acceso a Internet desde Gladys. Sin cuenta ni clave.

## Configuración

| Campo                | Función                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| Nombres de dominio   | Hasta diez, separados por comas. Se acepta una dirección web: `https://www.ejemplo.es/` es `ejemplo.es`. |
| Idioma de los textos | Idioma de los nombres de funciones, estados de texto y resúmenes de escenas. Automático por defecto.     |

El botón **Comprobar un dominio** consulta enseguida el registro de cualquier dominio, sin seguirlo. **Comprobar ahora** vuelve a comprobar cada dominio (se hace solo una vez al día, por la noche). El estado de conexión enumera los dominios sin respuesta y las entradas que no son nombres de dominio.

## Uso

### Dispositivos

Abra la pestaña **Descubrir** y añada los dispositivos, uno por dominio. Cada uno tiene: los días antes de la caducidad (negativos una vez caducado), la fecha de caducidad, el registrador y el estado: Activo, Caduca pronto (30 días o menos), Caducado, Periodo de redención (caducado, aún recuperable con un coste) o Pendiente de eliminación.

### Widget del panel

**Nombres de dominio**: cuántos dominios se siguen, los días antes de la próxima caducidad, y luego cada dominio, la caducidad más próxima primero, con su fecha, su registrador y los días restantes en una insignia de color (naranja a 30 días, rojo a 7).

### Escenas

- **Dominio: caduca pronto**: el dominio caduca en 90, 60, 30, 14, 7, 3 o 1 día o menos, o el mismo día. Cada umbral se dispara una vez por fecha de caducidad. Cuando se alcanzan varios a la vez (un dominio añadido 5 días antes de caducar), solo se envía el más urgente.
- **Dominio: renovado**: la fecha de caducidad se ha aplazado; los umbrales vuelven a empezar desde la nueva fecha.
- Acción **Dominio: leer la caducidad**: días restantes, fecha, registrador, estado y un resumen listo para un mensaje.

Ejemplos: 30 días antes de la caducidad, enviar «ejemplo.es caduca en 30 días (19 de diciembre de 2026).» por Telegram; en la renovación, agradecer al tesorero de la asociación.

### Transporte

La integración consulta los registros por Internet (insignia «cloud»): solo el nombre de dominio va en las solicitudes, nada sobre usted sale de su red. Una solicitud por dominio y por día.

### Extensiones

RDAP cubre .com, .net, .org, .fr, .uk, .nl, .dev, .app y la mayoría de las extensiones; whois cubre otras como .io e .it. Algunos registros no publican ninguna fecha de caducidad (.de, .eu, .be, .ch): el dominio aparece entonces con este motivo y no se ofrece ningún dispositivo.

## Solución de problemas

- **«No es un nombre de dominio»**: compruebe la ortografía; una dirección IP o un nombre sin extensión se rechaza.
- **«No registrado»**: el registro no conoce el dominio (errata, o dominio eliminado).
- **«El registro limita las solicitudes»**: algunos servidores whois rechazan las solicitudes frecuentes. La integración lo vuelve a intentar sola más tarde y conserva la última respuesta.
- **Informe de error**: pulse **Diagnóstico** y copie las líneas «Diagnostic:» de la pestaña Registros, con las versiones de Gladys y de la integración (Gladys no pasa `DEBUG` al contenedor).
