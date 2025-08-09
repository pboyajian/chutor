declare function extractGameNames(game: any): {
    white?: string;
    black?: string;
};
declare function deriveUsernameFromGames(all: any[]): string | undefined;
declare function computeVerboseMoves(game: any): Array<{
    san: string;
    from: string;
    to: string;
    promotion?: string;
}>;
declare function computePositions(game: any): Map<number, string>;
declare function computeRecurringPatterns(games: any[], topBlunders: any[], verboseMovesByGame: Map<string, any[]>): any[];
declare function analyzeGamesWithPrecomputedData(games: any[], options?: {
    onlyForUsername?: string;
}): any;
declare function analyzeGames(games: any[], options?: {
    onlyForUsername?: string;
}): any;
//# sourceMappingURL=analysis.d.ts.map