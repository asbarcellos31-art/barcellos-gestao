CREATE TABLE `extrato_comissao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadId` int NOT NULL,
	`mes` int NOT NULL,
	`ano` int NOT NULL,
	`cpfProdutor` varchar(20),
	`codigoProdutor` varchar(20),
	`nomeProdutor` varchar(255),
	`tipoCliente` varchar(50),
	`nomeCliente` varchar(255),
	`cpfCliente` varchar(20),
	`proposta` varchar(50),
	`inscricao` varchar(50),
	`descricaoProduto` varchar(255),
	`codigoProduto` varchar(20),
	`upVenda` varchar(100),
	`valorBase` decimal(15,2),
	`parcelaComissionada` int,
	`competenciaComissionada` varchar(20),
	`parcelaFaturada` int,
	`competenciaFaturada` varchar(20),
	`valorAngariacao` decimal(15,2),
	`valorComissaoTotal` decimal(15,2),
	`corretorInterno` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `extrato_comissao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `extrato_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nomeArquivo` varchar(255) NOT NULL,
	`mes` int NOT NULL,
	`ano` int NOT NULL,
	`totalRegistros` int DEFAULT 0,
	`totalComissao` decimal(15,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `extrato_uploads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inadimplente_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nomeArquivo` varchar(255) NOT NULL,
	`mes` int NOT NULL,
	`ano` int NOT NULL,
	`totalRegistros` int DEFAULT 0,
	`totalValor` decimal(15,2) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inadimplente_uploads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inadimplentes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadId` int NOT NULL,
	`mes` int NOT NULL,
	`ano` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`cpf` varchar(20),
	`telefone1` varchar(30),
	`telefone2` varchar(30),
	`mesParcela` varchar(50),
	`parcela` varchar(20),
	`formaPagamento` varchar(50),
	`valorParcelas` varchar(500),
	`valorTotal` decimal(15,2),
	`produtos` text,
	`status` varchar(50) DEFAULT 'PENDENTE',
	`historicoCobranca` text,
	`observacao` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inadimplentes_id` PRIMARY KEY(`id`)
);
