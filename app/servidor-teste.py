"""
Servidor estatico com fallback para index.html.

Existe porque o `vite dev` as vezes trava o sandbox nos testes de interface, e
porque o app usa rotas do lado do cliente: /estoque e /campanhas nao existem
como arquivo e um servidor comum devolveria 404.

    npm run build && python3 servidor-teste.py
    python3 servidor-teste.py 4501 dist-mock

O segundo argumento e a pasta. Os testes de cadastro escrevem produto, entrada,
despesa e conta: rodando contra o banco de verdade, eles sujariam o estoque da
loja. Por isso existem duas construcoes -- `dist` ligada no Supabase e
`dist-mock` sem as variaveis de ambiente, em dados de demonstracao.
"""
import http.server, socketserver, os, sys

pasta = sys.argv[2] if len(sys.argv) > 2 else 'dist'
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), pasta))

class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        caminho = self.translate_path(self.path)
        if not os.path.exists(caminho) or os.path.isdir(caminho):
            if not self.path.startswith('/assets'):
                self.path = '/index.html'
        return super().do_GET()
    def log_message(self, *a):
        pass

socketserver.TCPServer.allow_reuse_address = True
porta = int(sys.argv[1]) if len(sys.argv) > 1 else 4500
socketserver.TCPServer(('127.0.0.1', porta), H).serve_forever()
