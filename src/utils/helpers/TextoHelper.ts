class TextoHelper {
  /**
   * Remove tags HTML, scripts e caracteres especiais de um nome,
   * preservando apenas letras (incluindo acentuação) e espaços.
   */
  public static sanitizarNome(nome: string): string {
    if (!nome) return '';
    
    return nome
      // 1. Remove qualquer tag HTML/XML inteira (Prevenção direta contra tags <script>)
      .replace(/<[^>]*>/g, '')
      // 2. Mantém apenas letras (A-Z, a-z), caracteres acentuados latinos e espaços
      .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s]/g, '')
      // 3. Substitui múltiplos espaços seguidos por um único espaço
      .replace(/\s+/g, ' ')
      // 4. Remove espaços em branco no início e no fim
      .trim();
  }
}

export default TextoHelper;