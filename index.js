import { Parser, tokTypes, TokenType } from 'acorn';
import { ancestor } from 'acorn-walk';
import { replace } from 'estraverse';
import { generate } from 'astring';

const codes = {
	lozenge: 0x25CA, // ◊
	e: 0x65,
	f: 0x66,
	i: 0x69,
	m: 0x6D,
	r: 0x72,
	s: 0x73,
	t: 0x74
}

const putback = {
	'◊e': " ends with ",
	'◊f': "|",
	'◊i': " in ",
	'◊m': " matches ",
	'◊r': "..",
	'◊s': " starts with ",
	'◊t': "//"
};

const operators = {
	' and ': '&&',
	' or ': '||',
	' not ': '!',
	' b-or ': '|',
	' b-and ': '&',
	' b-xor ': '^',
	'~': '+' 
};

const unsupported_operators = [
	'\\?\\:', // ?:
	'\\?\\?', // ?? 
	' is '
];

const operators_re = new RegExp(Object.keys(operators).join('|'), 'g');
const unsupported_re = new RegExp(unsupported_operators.join('|'), 'g');
const putback_re = new RegExp(Object.keys(putback).join('|'), 'g');

class SontagParser extends Parser {
	constructor(...args) {
		super(...args);
		
		/* 
			Allow most reserved keywords as identifiers,
			but keep some of them (literals, etc).
		*/
		this.keywords = /^(?:void|this|null|true|false)$/;

		tokTypes.sontag_filter = new TokenType(`◊f`, {
			beforeExpr: true, 
			binop: 0.2
		});

		tokTypes.sontag_range = new TokenType(`◊r`, {
			beforeExpr: true, 
			binop: 8.6
		});

		tokTypes.sontag_trunc = new TokenType(`◊t`, {
			beforeExpr: true, 
			binop: 10
		});

		tokTypes.sontag_startswith = new TokenType(`◊s`, {
			beforeExpr: true, 
			binop: 8.5
		});

		tokTypes.sontag_endswith = new TokenType(`◊e`, {
			beforeExpr: true, 
			binop: 8.5
		});

		tokTypes.sontag_matches = new TokenType(`◊m`, {
			beforeExpr: true, 
			binop: 8.5
		});

		tokTypes.sontag_in = new TokenType(`◊i`, {
			beforeExpr: true, 
			binop: 8.4
		});
	}

	readToken(code) {
		if (code === codes.lozenge) {
			let next = this.input.charCodeAt(this.pos + 1);
			if (next === codes.f) {
				return this.finishOp(tokTypes.sontag_filter, 2);
			} else if (next === codes.r) {
				return this.finishOp(tokTypes.sontag_range, 2);
			} else if (next === codes.t) {
				return this.finishOp(tokTypes.sontag_trunc, 2);
			} else if (next === codes.s) {
				return this.finishOp(tokTypes.sontag_startswith, 2);
			} else if (next === codes.e) {
				return this.finishOp(tokTypes.sontag_endswith, 2);
			} else if (next === codes.m) {
				return this.finishOp(tokTypes.sontag_matches, 2);
			} else if (next === codes.i) {
				return this.finishOp(tokTypes.sontag_in, 2);
			}
		} else {
			return super.readToken(code);
		}
	}
}

function wrapAwait(node) {
	return {
		type: "AwaitExpression",
		argument: node
	};
}

export function parseExpression(str, opts) {
	if (!str) return str;

	opts = {
		async: false,
		rangeFunction: 'this.__filters__.range',
		truncFunction: 'Math.trunc',
		startsWithFunction: '"".startsWith.call',
		endsWithFunction: '"".endsWith.call',
		matchesFunction: '!!"".match.call',
		identifierScope: 'this',
		filterScope: 'this.__filters__',
		...opts
	};

	// Throw on unsupported operators
	let bummer = str.match(unsupported_re);
	if (bummer) {
		throw new Error(`These operators are not yet supported: ${ bummer.join(', ') }`)
	}

	// Replace | with filter operator and .. with range operator
	str = str
		.replace(/[^\|](\|)(?!\|)/g, function(str, match) {
			return str[0] + '◊f';
		})
		.replace(/[^.]\.{2}(?!\.)/g, function(str, match) {
			return str[0] + '◊r';
		})
		.replace(/\/{2}/g, function(str, match) {
			return '◊t';
		})
		.replace(/ starts with /g, function(str, match) {
			return '◊s';
		})
		.replace(/ ends with /g, function(str, match) {
			return '◊e';
		})
		.replace(/ matches /g, function(str, match) {
			return '◊m';
		})
		.replace(/ in /g, function(str, match) {
			return '◊i';
		});

	// Replace Sontag operators with equivalent ECMAScript operators
	str = str.replace(operators_re, matched => operators[matched]);

	let parser = new SontagParser({
		allowReserved: true,
		ecmaVersion: 2020
	}, str);
	parser.nextToken();
	
	let ast = parser.parseExpression();

	const replacements = new Map();

	ancestor(ast, {

		Identifier(node, ancestors) {
			node.__replace_name__ = true;
		},

		TemplateElement(node) {
			// TODO should we treat the two differently?
			node.value.raw = node.value.raw.replace(putback_re, matched => putback[matched]);
			node.value.cooked = node.value.cooked.replace(putback_re, matched => putback[matched]);
		},

		Literal(node) {
			if (typeof node.value === 'string') {
				// TODO should we treat the two differently?
				node.value = node.value.replace(putback_re, matched => putback[matched]);
				node.raw = node.raw.replace(putback_re, matched => putback[matched]);
			}
		},

		BinaryExpression(node) {
			if (node.operator === '◊f') {
				let { left, right } = node;

				if (right.type === 'CallExpression') {
					// We have a function on the right-hand side,
					// add left-hand side to the list of arguments
					right.callee.__is_filter__ = true;
					let replacement = {
						...right,
						arguments: right.arguments.concat(left)
					};
					replacements.set(node, opts.async ? wrapAwait(replacement) : replacement);
				} else if (right.type === 'Identifier') {
					// We have an identifier on the right-hand side,
					// make it a function that calls the left-hand side
					right.__is_filter__ = true;
					let replacement = {
						type: 'CallExpression',
						callee: right,
						arguments: [ left ]
					};
					replacements.set(node, opts.async ? wrapAwait(replacement) : replacement);
				}
			} else if (node.operator === '◊r') {
				let { left, right } = node;
				replacements.set(node, {
					type: 'CallExpression',
					callee: {
						type: 'Identifier',
						name: opts.rangeFunction
					},
					arguments: [ left, right ]
				});
			} else if (node.operator === '◊t') {
				replacements.set(node, {
					type: 'CallExpression',
					callee: {
						type: 'Identifier',
						name: opts.truncFunction
					},
					arguments: [{
						...node,
						operator: '/' 
					}]
				});
			} else if (node.operator === '◊s') {
				replacements.set(node, {
					type: 'CallExpression',
					callee: {
						type: 'Identifier',
						name: opts.startsWithFunction
					},
					arguments: [node.left, node.right]
				});
			} else if (node.operator === '◊e') {
				replacements.set(node, {
					type: 'CallExpression',
					callee: {
						type: 'Identifier',
						name: opts.endsWithFunction
					},
					arguments: [node.left, node.right ]
				});
			} else if (node.operator === '◊m') {
				replacements.set(node, {
					type: 'CallExpression',
					callee: {
						type: 'Identifier',
						name: opts.matchesFunction
					},
					arguments: [node.left, node.right ]
				});
			} else if (node.operator === '◊i') {
				replacements.set(node, {
					type: 'CallExpression',
					callee: {
						type: 'MemberExpression',
						object: node.right,
						property: { 
							type: 'Identifier', 
							name: 'includes' 
						},
						computed: false
					},
					arguments: [node.left]
				});
			}
		}
	});

	return generate(
		replace(ast, {
			enter(node) {
				if (replacements.has(node)) {
					return replacements.get(node);
				} else if (node.__replace_name__) {
					return {
						...node,
						name: node.__is_filter__ ? 
							`${opts.filterScope}.${node.name}` :
							`${opts.identifierScope}.${node.name}`
					};
				}
			}
		})
	);
}