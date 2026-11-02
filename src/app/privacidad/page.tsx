import { LegalPage, M } from "@/components/legal";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Política de privacidad" };

export default function Privacidad() {
  return (
    <LegalPage title="Política de tratamiento de datos personales">
      <section><h2>1. Responsable</h2>
        <p><M>{LEGAL.company}</M>, identificada con NIT <M>{LEGAL.nit}</M>, con domicilio en <M>{LEGAL.address}</M> (en adelante, «Money»), es la responsable del tratamiento de tus datos personales, conforme a la Ley 1581 de 2012, el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015) y demás normas aplicables. Contacto para asuntos de datos personales: <M>{LEGAL.email}</M>.</p></section>

      <section><h2>2. Qué datos recogemos</h2><ul>
        <li><strong>De tu cuenta:</strong> nombre, correo electrónico y contraseña (la contraseña la gestiona nuestro proveedor de autenticación y se guarda cifrada; nosotros no la vemos).</li>
        <li><strong>Datos financieros que tú registras o importas:</strong> cuentas, movimientos, categorías, presupuestos, metas de ahorro, deudas, bienes, proyectos y grupos de gastos compartidos (incluidos los nombres de las personas que agregues al grupo).</li>
        <li><strong>De las funciones automáticas:</strong> el resultado de leer tus recibos, extractos, textos o correos (el movimiento detectado), y un registro de los correos procesados con remitente, asunto, fecha y resultado.</li>
        <li><strong>De uso:</strong> cuántas consultas con inteligencia artificial haces cada mes, para aplicar los límites de tu plan.</li>
        <li><strong>De pagos:</strong> referencia, valor, estado y método de cada pago. Los datos de tu tarjeta o cuenta los procesa Wompi directamente; nosotros no los recibimos ni los guardamos.</li>
        <li><strong>Técnicos:</strong> cookies de sesión estrictamente necesarias para mantenerte conectado. No usamos cookies de publicidad ni herramientas de analítica de terceros.</li></ul></section>

      <section><h2>3. Para qué los usamos</h2><ul>
        <li>Prestarte el servicio: mostrarte tus finanzas, calcular presupuestos, metas, proyecciones y alertas.</li>
        <li>Autenticarte y proteger tu cuenta.</li>
        <li>Cobrar tu suscripción y atender soporte.</li>
        <li>Ejecutar las funciones automáticas que tú activas (lectura de recibos, extractos y correos; asistente).</li>
        <li>Cumplir obligaciones legales, entre ellas las contables.</li></ul>
        <p>No vendemos tus datos, no los usamos para publicidad y no los compartimos con terceros distintos de los indicados abajo. <M>CONFIRMAR con el negocio que no habrá usos adicionales (por ejemplo, analítica agregada o mejora de producto) antes de publicar; si los hay, deben declararse aquí.</M></p></section>

      <section><h2>4. Inteligencia artificial</h2>
        <p>Cuando usas el análisis de recibos, extractos PDF, texto o voz, o el asistente, el contenido que envías se transmite a Anthropic para extraer los datos o responder tu pregunta. En el asistente, se envían también los resultados de consultas a tus propios datos financieros que sean necesarios para responder. <strong>No guardamos la foto, el PDF ni el cuerpo del texto:</strong> solo conservamos el movimiento resultante. <M>CONFIRMAR con los términos vigentes de Anthropic su política de retención y de no entrenamiento con datos de clientes, y ajustar esta frase a lo que realmente aplique.</M></p>
        <p>Las funciones de IA pueden equivocarse. Por eso lo detectado queda <strong>pendiente de tu revisión</strong> y no cuenta hasta que lo confirmes.</p></section>

      <section><h2>5. Lectura de tu correo</h2>
        <p>Solo si tú conectas una cuenta de Gmail, Outlook u otro correo por IMAP. Pedimos permiso de <strong>solo lectura</strong>: nunca enviamos, borramos ni movemos correos. Antes de usar IA filtramos por remitente y asunto: promociones, códigos de seguridad y conversaciones personales no se leen. Del correo que parece una transacción, enviamos el texto a Anthropic para extraer valor, fecha y comercio, y <strong>no guardamos el contenido del correo</strong>: solo el movimiento, el remitente, el asunto y la fecha. Los accesos (tokens y contraseñas de aplicación) se guardan cifrados. Puedes desconectar en cualquier momento: se borra el acceso y el registro de correos procesados, y revocamos el permiso en Google.</p>
        <p>El uso y la transferencia a cualquier otra aplicación de la información recibida de las API de Google se ajustarán a la <em>Política de datos de usuario de los servicios de las API de Google</em>, incluidos los requisitos de uso limitado. <M>VERIFICAR con un abogado que el uso actual cumple esa política antes de solicitar la verificación de Google.</M></p></section>

      <section><h2>6. Con quién los compartimos</h2>
        <p>Usamos proveedores que tratan datos por cuenta nuestra (encargados): Supabase (base de datos y autenticación), Vercel (alojamiento), Anthropic (inteligencia artificial), Wompi (pagos) y, solo si tú conectas tu correo, Google o Microsoft. Pueden estar ubicados o procesar datos fuera de Colombia. <M>CONFIRMAR las regiones donde se alojan los datos y si se requiere declarar la transferencia internacional o contar con cláusulas adicionales.</M></p></section>

      <section><h2>7. Cómo los protegemos</h2>
        <p>Conexiones cifradas (HTTPS), accesos y claves de terceros cifrados, y reglas en la base de datos para que cada usuario solo pueda leer y modificar sus propios datos. Ningún sistema es infalible, pero trabajamos para reducir el riesgo y te avisaremos de incidentes que te afecten según la ley.</p></section>

      <section><h2>8. Tus derechos</h2>
        <p>Como titular puedes conocer, actualizar y rectificar tus datos, solicitar prueba de la autorización, ser informado del uso que se les da, presentar quejas ante la Superintendencia de Industria y Comercio, revocar la autorización y solicitar la supresión de tus datos, y acceder gratuitamente a ellos.</p>
        <ul><li><strong>Acceso y portabilidad:</strong> en la aplicación, «Mi cuenta → Mis datos», puedes descargar un Excel, un informe en PDF y un respaldo completo.</li>
          <li><strong>Supresión:</strong> en el mismo lugar puedes eliminar tu cuenta y todos tus datos.</li>
          <li><strong>Consultas y reclamos:</strong> escríbenos a <M>{LEGAL.email}</M>. Las consultas se responden en máximo 10 días hábiles y los reclamos en máximo 15 días hábiles, prorrogables en los términos de la ley.</li></ul></section>

      <section><h2>9. Cuánto tiempo los conservamos</h2>
        <p>Mientras tengas cuenta. Si la eliminas, borramos tus datos; solo conservamos, <strong>sin tu nombre ni correo</strong>, los registros de pagos que la ley contable obliga a guardar. <M>CONFIRMAR con el contador el plazo de conservación de esos registros.</M> El registro de correos procesados se borra al desconectar la cuenta.</p></section>

      <section><h2>10. Menores de edad</h2><p>Money es para mayores de 18 años. No recolectamos intencionalmente datos de menores.</p></section>

      <section><h2>11. Cambios a esta política</h2><p>Si la modificamos de forma sustancial, te lo informaremos por la aplicación o por correo antes de que aplique.</p></section>
    </LegalPage>
  );
}
