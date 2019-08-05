const { Parser, tokTypes, TokenType } = require('acorn');
const { ancestor } = require('acorn-walk');
const { replace } = require('estraverse');
const { generate } = require('astring');
const util = require('util');

const codes = {
	lozenge: '◊'.charCodeAt(0),
	f: 'f'.charCodeAt(0),
	r: 'r'.charCodeAt(0)
}

class SontagParser extends Parser {
	constructor(...args) {
		super(...args);
		
		// Allow reserved keywords as identifiers
		this.keywords = /[^\s\S]/g;

		tokTypes.sontag_filter = new TokenType(`◊f`, {
			beforeExpr: true, 
			binop: 0.99
		});

		tokTypes.sontag_range = new TokenType(`◊r`, {
			beforeExpr: true, 
			binop: 0.99
		});
	}

	readToken(code) {
		if (code === codes.lozenge) {
			let next = this.input.charCodeAt(this.pos + 1);
			if (next === codes.f) {
				return this.finishOp(tokTypes.sontag_filter, 2);
			} else if (next === codes.r) {
				return this.finishOp(tokTypes.sontag_range, 2);
			}
		} else {
			return super.readToken(code);
		}
	}
}

module.exports = {
	expression: function(str, opts) {

		opts = {
			rangeFunction: 'this.__filters__.range',
			identifierScope: 'this',
			filterScope: 'this.__filters__',
			...opts
		};

		let parser = new SontagParser({
			allowReserved: true
		}, str);
		parser.nextToken();
		let ast = parser.parseExpression();

  		const replacements = new Map();

		ancestor(ast, {

			Identifier(node, ancestors) {
				let parent = ancestors[0];
				replacements.set(node, {
					...node,
					name: parent && parent.operator === '◊f' && parent.right === node ? 
						`${opts.filterScope}.${node.name}` :
						`${opts.identifierScope}.${node.name}`
				})
			},

			BinaryExpression(node) {
				if (node.operator === '◊f') {
					let { left, right } = node;

					if (right.type === 'CallExpression') {
						// We have a function on the right-hand side,
						// add left-hand side to the list of arguments
						replacements.set(node, {
							...node.right,
							arguments: node.right.arguments.concat(left)
						});
					} else if (right.type === 'Identifier') {
						// We have an identifier on the right-hand side,
						// make it a function that calls the left-hand side
						replacements.set(node, {
							type: 'CallExpression',
							callee: right,
							arguments: [ left ]
						});
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
				}
			}
		});

		return generate(
			replace(ast, {
				enter(node) {
					if (replacements.has(node)) {
						return replacements.get(node);
					}
				}
			})
		);
	}
};