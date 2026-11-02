import { LegalPage, M } from "@/components/legal";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Términos del servicio" };

export default function Terminos() {
  return (
    <LegalPage title="Términos del servicio">
      <section><h2>1. Aceptación</h2>
        <p>Al crear una cuenta o usar Money aceptas estos términos y la <a className="underline" href="/privacidad">política de privacidad</a>. El servicio lo presta <M>{LEGAL.company}</M> (NIT <M>{LEGAL.nit}</M>). Debes ser mayor de 18 años.</p></section>

      <section><h2>2. Qué es Money (y qué no es)</h2>
        <p>Money es una herramienta para organizar tus finanzas personales: registrar ingresos, egresos, ahorros y deudas, y ver cálculos y proyecciones. <strong>No es una entidad financiera, no mueve ni custodia tu dinero y no presta asesoría financiera, de inversión, tributaria ni legal.</strong> Los cálculos (puntaje de salud financiera, simuladores, proyecciones, sugerencias del asistente) usan reglas generales y son orientativos; las decisiones son tuyas.</p></section>

      <section><h2>3. Tu cuenta</h2>
        <p>Eres responsable de la veracidad de los datos que registras y de proteger tu contraseña. Avísanos si sospechas un uso no autorizado. Puedes cerrar tu cuenta en cualquier momento desde «Mis datos».</p></section>

      <section><h2>4. Funciones con inteligencia artificial</h2>
        <p>La lectura de recibos, extractos, textos y correos, y el asistente, usan IA y <strong>pueden contener errores</strong>. Los movimientos detectados quedan pendientes de tu revisión: confírmalos solo si son correctos. No uses estas funciones como único respaldo para decisiones importantes. Cada plan incluye un cupo mensual de consultas con IA.</p></section>

      <section><h2>5. Planes, precios y pagos</h2><ul>
        <li>Hay un plan gratis y planes de pago. Los precios están en pesos colombianos y se muestran antes de pagar.</li>
        <li>Los pagos se procesan con Wompi. Money no recibe ni guarda los datos de tu tarjeta.</li>
        <li><strong>Prueba gratis:</strong> algunos planes incluyen una prueba sin tarjeta, una sola vez por persona y plan. Al terminar, tu cuenta vuelve al plan gratis si no pagas.</li>
        <li><strong>Renovación:</strong> por ahora la renovación es manual: te avisamos antes del vencimiento y tú pagas para continuar. <M>ACTUALIZAR este punto si se activa el cobro automático (debe pedirse una autorización expresa para guardar el medio de pago).</M></li>
        <li><strong>Cancelación:</strong> puedes cancelar en cualquier momento; conservas los beneficios hasta el final del periodo ya pagado.</li>
        <li><strong>Cambios de precio:</strong> <M>DEFINIR con cuánta anticipación se avisa un cambio de precio.</M></li></ul></section>

      <section><h2>6. Reembolsos y retracto</h2>
        <p><M>DECISIÓN Y VALIDACIÓN LEGAL: definir la política de reembolsos y cómo se aplica el derecho de retracto del Estatuto del Consumidor (Ley 1480 de 2011) a compras a distancia de servicios digitales, incluidas las excepciones aplicables.</M></p></section>

      <section><h2>7. Uso aceptable</h2>
        <p>No puedes usar Money para actividades ilegales, intentar acceder a datos de otras personas, sobrecargar o vulnerar el servicio, extraer datos de forma automatizada ni hacer ingeniería inversa. Podemos suspender cuentas que incumplan estas reglas.</p></section>

      <section><h2>8. Disponibilidad y cambios</h2>
        <p>Buscamos que el servicio esté siempre disponible, pero puede haber interrupciones por mantenimiento o por fallas de proveedores (por ejemplo, bancos, correo o pagos). Podemos modificar o retirar funciones; si afecta algo que pagaste, te lo informaremos.</p></section>

      <section><h2>9. Responsabilidad</h2>
        <p><M>VALIDACIÓN LEGAL: redactar la limitación de responsabilidad conforme a la ley colombiana (no puede excluir lo que la ley no permite excluir frente a consumidores).</M></p></section>

      <section><h2>10. Propiedad intelectual y tus datos</h2>
        <p>El software y la marca son de Money. Tus datos son tuyos: nos autorizas únicamente a tratarlos para prestarte el servicio, según la política de privacidad.</p></section>

      <section><h2>11. Terminación</h2>
        <p>Puedes dejar de usar el servicio y eliminar tu cuenta cuando quieras. Podemos terminar o suspender el servicio por incumplimiento de estos términos o por obligación legal.</p></section>

      <section><h2>12. Ley aplicable y contacto</h2>
        <p>Estos términos se rigen por las leyes de Colombia. <M>VALIDACIÓN LEGAL: jurisdicción y mecanismos de solución de controversias.</M> Escríbenos a <M>{LEGAL.email}</M>.</p></section>
    </LegalPage>
  );
}
