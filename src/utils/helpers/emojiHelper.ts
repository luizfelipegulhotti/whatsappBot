export class EmojiHelper {
    // CORREÇÃO: Expressão regular corrigida para aceitar o joinha amarelo padrão e todas as variações de pele
    private static readonly JOINHA_REGEX = /^[\u{1F44D}\u{1F3FB}-\u{1F3FF}]|^\u{1F44D}$/u;

    static isJoinha(texto: string): boolean {
        return this.JOINHA_REGEX.test(texto.trim());
    }
}