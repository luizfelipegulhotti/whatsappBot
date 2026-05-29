import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Bairro } from "./Bairro";
import { Estado } from "./Estado";

@Entity('cidade')
export class Cidade{
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string;

    @OneToMany(() => Bairro, bairro => bairro.cidade)
    bairros?: Bairro[];

    @Column()
    estadoId?: number;

    @ManyToOne(() => Estado, estado => estado.cidades, { 
        eager:true,
        cascade: true
    })
    @JoinColumn({name: 'estadoId'})
    estado?: Estado;
}