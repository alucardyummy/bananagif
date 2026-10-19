# bananagif

Deixe seu GIF no tamanho que você precisa. Você diz o tamanho final (por exemplo 220 KB) e o
site procura sozinho a melhor qualidade que cabe nele.

**Tudo roda no navegador de quem usa.** O GIF não é enviado para nenhum servidor: a compressão usa o
[gifsicle](https://www.lcdf.org/gifsicle/) compilado para WebAssembly.

## Como ele escolhe

Ele testa combinações até achar a de maior qualidade abaixo do limite:

1. Primeiro só reduz a largura (e otimiza os quadros), sem perda extra de cor. Nos testes, isso
   estraga menos a imagem do que comprimir forte.
2. Se a largura que cabe ficar pequena demais (menos de 70% da original), tenta compressão leve,
   média e forte nas cores, e fica com o melhor resultado.
3. Dá para limitar a largura máxima, se você quiser um tamanho em pixels específico.

Um GIF que já cabe no limite é devolvido como está.

## Rodar no seu computador

Não tem build nem dependência. Basta servir a pasta:

```
python3 -m http.server 8000
```

e abrir http://localhost:8000. (Abrir o `index.html` direto do arquivo não funciona, porque o site
usa módulos JavaScript.)

## Publicar na Vercel

1. Em vercel.com, clique em **Add New → Project** e importe este repositório.
2. Deixe **Framework Preset** em *Other* e **não** preencha Build Command nem Output Directory.
3. Clique em **Deploy**.

## Arquivos

- `index.html`, `style.css`, `app.js`: o site
- `vendor/`: o gifsicle em WebAssembly
- `fonts/`: Libre Caslon, hospedada aqui (o site não chama nenhum serviço externo)
- `vercel.json`: cabeçalhos de segurança e cache

Licenças de terceiros em [THIRD_PARTY.md](THIRD_PARTY.md).
