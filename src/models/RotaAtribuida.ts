import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Motorista } from "./Motorista";
import { ListaJoia } from "./ListaJoia";
import { ListaRota } from "./ListaRota";
import { Passageiro } from "./Passageiro";
import { Rota } from "./Rota";

@Entity('atribuicao_final')
export class RotaAtribuida {
    @PrimaryGeneratedColumn()
    id!: number;

    // Faltava esta linha para o Service parar de dar erro:
    @Column({ type: "timestamp", name: "dataGeracao" }) 
    dataGeracao!: Date;

    @ManyToOne(() => Motorista)
    motorista!: Motorista;

     @Column({
        type: "enum",
        enum: ["ROTA", "APOIO", "PLANTAO"],
        default: "ROTA"
    })
    tipoAtribuicao!: "ROTA" | "APOIO" | "PLANTAO";

    @ManyToOne(() => ListaJoia)
    listaJoia!: ListaJoia;

    @ManyToOne(() => ListaRota, lista => lista.rotaLista)
    listaRota!: ListaRota;

    @OneToMany(() => Passageiro, passageiro => passageiro.corridaSolicitada)
    passageiros!: Passageiro[];

    @ManyToOne(() => Rota)
    rota!: Rota;
}
