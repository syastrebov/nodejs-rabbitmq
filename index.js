(function(exports) {
    'use strict';

    var net          = require('net');
    var bramqp       = require('bramqp');
    var async        = require('async');
    var util         = require('util');
    var eventEmitter = require('events').EventEmitter;

    util.inherits(Rabbit, eventEmitter);

    /**
     * Обработчик очереди
     *
     * @param {object}  connection
     * @param {string}  queueName
     * @param {string}  exchangeName
     * @param {string}  exchangeType
     *
     * @constructor
     */
    function Rabbit(connection, queueName, exchangeName, exchangeType) {

        var self = this, log, verbose;

        /**
         * Настройки по умолчанию
         */
        connection   = connection   || {};
        queueName    = queueName    || 'node.js-queue';
        exchangeName = queueName    || 'node.js-exchange';
        exchangeType = exchangeType || 'direct';

        /**
         * Логирование действий
         *
         * @param {*} data
         */
        log = function(data) {
            if (verbose) {
                console.log(data);
            }
        };

        /**
         * Открываем соединения для обработки очереди
         */
        self.start = function() {
            bramqp.selectSpecification('rabbitmq/full/amqp0-9-1.stripped.extended', function(error) {
                if (error) {
                    throw error;
                }

                var socket = net.connect({
                    host : connection.host || 'localhost',
                    port : connection.port || 5672
                }, function() {
                    bramqp.initializeSocket(socket, function(error, handle) {
                        async.series([
                            function(seriesCallback) {
                                handle.openAMQPCommunication(
                                    connection.login    || 'guest',
                                    connection.password || 'guest',
                                    true,
                                    seriesCallback
                                );
                            },
                            function(seriesCallback) {
                                var passive    = false,
                                    durable    = false,
                                    autoDelete = false,
                                    internal   = false,
                                    noWait     = false,
                                    options    = {};

                                handle.exchange.declare(
                                    1,
                                    exchangeName,
                                    exchangeType,
                                    passive,
                                    durable,
                                    autoDelete,
                                    internal,
                                    noWait,
                                    options
                                );
                                handle.once('exchange.declare-ok', function() {
                                    log('exchange declared');
                                    seriesCallback();
                                });
                            }, function(seriesCallback) {
                                var passive    = false,
                                    durable    = true,
                                    exclusive  = false,
                                    autoDelete = false,
                                    noWait     = false,
                                    options    = {};

                                handle.queue.declare(
                                    1,
                                    queueName,
                                    passive,
                                    durable,
                                    exclusive,
                                    autoDelete,
                                    noWait,
                                    options
                                );
                                handle.once('queue.declare-ok', function() {
                                    log('queue declared');
                                    seriesCallback();
                                });
                            }, function(seriesCallback) {
                                handle.queue.bind(1, queueName, exchangeName, null, false, {});
                                handle.once('queue.bind-ok', function() {
                                    log('queue bound sucessfully');
                                    seriesCallback();
                                });
                            }
                        ], function() {

                            /**
                             * Соединение установлено
                             * Очередь и обменник успешно инициализированы
                             *
                             * Возвращает обработчик управления соеднинением
                             */
                            log('all done');
                            self.emit('ready', {

                                /**
                                 * Запустить получение сообщений из очереди
                                 */
                                deliver: function() {
                                    var noLocal   = false,
                                        noAck     = true,
                                        exclusive = true,
                                        noWait    = false,
                                        options   = false;

                                    handle.basic.consume(
                                        1,
                                        queueName,
                                        noLocal,
                                        noAck,
                                        exclusive,
                                        noWait,
                                        options,
                                        {}
                                    );
                                    handle.once('basic.consume-ok', function(channel, method, data) {
                                        log('consuming from queue');
                                        log(data);
                                        handle.on('basic.deliver', function(channel, method, data) {
                                            log('incoming message');
                                            log(data);
                                            handle.once('content', function(channel, className, properties, content) {
                                                log('got a message:');
                                                log(content.toString());
                                                log('with properties:');
                                                log(properties);

                                                self.emit('incoming.message', content);
                                            });
                                        });
                                    });
                                },

                                /**
                                 * Опубликовать сообщение в очередь
                                 *
                                 * @param {*} content
                                 */
                                publish: function(content) {
                                    var publishErrors = true,
                                        routingKey    = null,
                                        queueMessages = false, // not supported by RabbitMQ
                                        contentType   = 'basic',
                                        properties    = {};

                                    handle.basic.publish(
                                        1,
                                        exchangeName,
                                        routingKey,
                                        publishErrors,
                                        queueMessages,

                                        function() {
                                            handle.content(1, contentType, properties, content, function() {
                                                self.emit('published.message', content);
                                            });
                                        }
                                    );

                                    handle.on('basic.return', function(replyCode, replyText, exchange, routingKey) {
                                        log('Message Returned from Server');
                                        log(replyCode);
                                        log(replyText);
                                        log(exchange);
                                        log(routingKey);
                                    });
                                },

                                /**
                                 * Закрыть соединение
                                 *
                                 * @param {function} callback
                                 */
                                close: function(callback) {
                                    log('close communication');
                                    handle.closeAMQPCommunication(function() {
                                        log('rabbit socket ended');

                                        socket.removeAllListeners();
                                        handle.removeAllListeners();

                                        handle.socket.end();
                                        setImmediate(callback);
                                    });
                                }
                            });
                        });
                    });
                });

                socket.on('error', function(error) {
                    log(error);
                    self.emit('error', error);
                });
            });
        };

        /**
         * Включить режим отладки
         *
         * @param {boolean} value
         */
        self.setVerbose = function(value) {
            verbose = !!value;
        };
    }

    /**
     * Создание нового экземпляра
     *
     * @param {object}  connection
     * @param {string}  queueName
     * @param {string}  exchangeName
     * @param {string}  exchangeType
     *
     * @returns {Rabbit}
     */
    exports.create = function(connection, queueName, exchangeName, exchangeType) {
        return new Rabbit(connection, queueName, exchangeName, exchangeType);
    };

}(exports));