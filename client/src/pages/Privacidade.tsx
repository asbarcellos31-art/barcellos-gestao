export default function Privacidade() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-[#1a2e4a] text-white py-6 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold">Barcellos Seguros</h1>
          <p className="text-blue-200 text-sm">Corretora de Seguros e Planos de Saúde</p>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-10 text-gray-800">
        <h2 className="text-2xl font-bold mb-2 text-[#1a2e4a]">Política de Privacidade</h2>
        <p className="text-sm text-gray-500 mb-8">Última atualização: março de 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">

          <div>
            <h3 className="font-semibold text-base mb-2">1. Quem somos</h3>
            <p>
              A <strong>Barcellos Seguros Corretora de Seguros Ltda.</strong> é uma corretora de seguros e planos de saúde
              com sede na Avenida Marechal Castelo Branco, 65, sala 1002-A, Campinas, São José/SC, CEP 88101-020.
              Atuamos na intermediação de planos de saúde, seguros de vida, seguros auto e demais produtos do setor securitário.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">2. Quais dados coletamos</h3>
            <p>
              Coletamos dados pessoais fornecidos diretamente por nossos clientes, parceiros e leads, incluindo:
              nome completo, CPF, data de nascimento, endereço, telefone, e-mail e informações relacionadas
              aos produtos contratados ou cotados.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">3. Como utilizamos seus dados</h3>
            <p>
              Utilizamos seus dados para: (a) prestação dos serviços de corretagem contratados; (b) envio de
              comunicações comerciais sobre produtos e serviços de interesse; (c) cumprimento de obrigações
              legais e regulatórias; e (d) melhoria dos nossos serviços.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">4. Comunicações por e-mail</h3>
            <p>
              Podemos enviar e-mails com informações sobre planos de saúde, seguros, novidades e promoções.
              Você pode cancelar o recebimento dessas comunicações a qualquer momento clicando no link
              "Cancelar inscrição" presente no rodapé de cada e-mail enviado, ou entrando em contato
              conosco pelo e-mail <strong>atendimento@barcellosseguros.com</strong>.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">5. Compartilhamento de dados</h3>
            <p>
              Não vendemos nem compartilhamos seus dados pessoais com terceiros para fins comerciais próprios.
              Podemos compartilhar informações com operadoras de planos de saúde e seguradoras estritamente
              para viabilizar a contratação dos produtos solicitados, e com prestadores de serviços tecnológicos
              que nos auxiliam na operação, sempre sob obrigação de confidencialidade.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">6. Seus direitos (LGPD)</h3>
            <p>
              Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem direito a: confirmar
              a existência de tratamento; acessar seus dados; corrigir dados incompletos ou inexatos; solicitar
              a exclusão de dados desnecessários; revogar o consentimento; e obter informações sobre o
              compartilhamento de dados.
            </p>
            <p className="mt-2">
              Para exercer seus direitos, entre em contato pelo e-mail <strong>atendimento@barcellosseguros.com</strong>.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">7. Segurança</h3>
            <p>
              Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados pessoais contra
              acesso não autorizado, perda, destruição ou divulgação indevida.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-base mb-2">8. Contato</h3>
            <p>Em caso de dúvidas sobre esta Política de Privacidade, entre em contato:</p>
            <div className="mt-2 bg-gray-50 rounded-lg p-4 border text-sm">
              <p><strong>Barcellos Seguros Corretora de Seguros Ltda.</strong></p>
              <p>Av. Marechal Castelo Branco, 65, sala 1002-A</p>
              <p>Campinas, São José/SC — CEP 88101-020</p>
              <p>E-mail: atendimento@barcellosseguros.com</p>
              <p>Site: barcellosseguros.com</p>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-6 px-4 text-center text-xs text-gray-400">
        <p>© {new Date().getFullYear()} Barcellos Seguros. Todos os direitos reservados.</p>
        <p className="mt-1">Corretora de Seguros — SUSEP</p>
      </footer>
    </div>
  );
}
