declare module 'pokersolver' {
  export class Hand {
    static solve(cards: string[], game?: string, canDisqualify?: boolean): Hand;
    static winners(hands: Hand[]): Hand[];

    cards: PokerSolverCard[];
    cardPool: PokerSolverCard[];
    name: string;
    rank: number;
    game: string;
    descr: string;

    toString(): string;
    toArray(): string[];
  }

  export interface PokerSolverCard {
    value: string;
    suit: string;
    rank: number;
    wildValue: string;
  }
}
