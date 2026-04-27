CREATE TABLE `contas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`descricao` varchar(255) NOT NULL,
	`dataVencimento` date NOT NULL,
	`valor` decimal(15,2) NOT NULL,
	`dataPagamento` date,
	`status` enum('PAGO','PENDENTE','ATRASADO') NOT NULL DEFAULT 'PENDENTE',
	`categoria` enum('SALARIO','COMISSAO','DISTRIBUICAO','VEICULO','ESTRUTURA','BANCO','IMPOSTOS','ALIMENTACAO','MATERIAL_ESCRITORIO','DIVERSOS') NOT NULL,
	`vinculo` enum('ANDERSON','NAYARA','ELISIA','BARCELLOS') NOT NULL,
	`valorPago` decimal(15,2),
	`mes` int NOT NULL,
	`ano` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contas_id` PRIMARY KEY(`id`)
);
