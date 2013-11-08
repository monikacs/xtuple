/*jshint indent:2, curly:true, eqeqeq:true, immed:true, latedef:true,
newcap:true, noarg:true, regexp:true, undef:true, strict:true, trailing:true,
white:true, expr:true */
/*global XT:true, XM:true, _:true */

XT.extensions.billing.initReceivableModel = function () {
  'use strict';

  /**
   * @class XM.Receivable
   * @extends XM.Document
   */
  XM.Receivable = XM.Document.extend({
    recordType: 'XM.Receivable',
    idAttribute: 'uuid',
    nameAttribute: 'documentNumber',
    documentKey: 'documentNumber',
    numberPolicySetting: XM.Document.AUTO_NUMBER,

    defaults: function () {
      return {
        currency: XT.baseCurrency(),
        balance: 0,
        taxTotal: 0
      };
    },

    // ..........................................................
    // METHODS
    //

    bindEvents: function (attributes, options) {
      XM.Model.prototype.bindEvents.apply(this, arguments);
      this.on('change:amount', this.amountDidChange);
      this.on('change:customer', this.customerDidChange);
      this.on('change:documentDate', this.documentDateDidChange);
      this.on('change:paid', this.paidDidChange);
      this.on('statusChange', this.statusDidChange);
      this.on('add:taxes remove:taxes', this.taxesDidChange);
    },

    /**
      When the amount is changed, commission should be recalculated
    */
    amountDidChange: function () {
      this.set("commission", this.calculateCommission());
      this.set("balance", this.calculateBalance());
    },
    /**
      When customer is set on XM.Receivable the terms, currency, and salesRep
       should be copied from the customer and commission should be recalculated
    */
    customerDidChange: function () {
      this.copyFromCustomer();
      this.calculateCommission();
    },
    /**
      When the document date or terms is changed the dueDate should
       be recalculated using the terms "calculateDueDate" function
    */
    documentDateDidChange: function () {
      this.set("dueDate", new Date());
    },
    paidDidChange: function () {
      this.set("balance", this.calculateBalance());
    },
    /**
      When the status of a receivable changes to READY_CLEAN, the following attributes
       should be changed to read only: customer, documentDate, documentType,
       documentNumber, terms
    */
    statusDidChange: function () {
      if (this.getStatus() === XM.Model.READY_CLEAN) {
        this.setReadOnly("customer");
        this.setReadOnly("documentDate");
        this.setReadOnly("documentType");
        this.setReadOnly("documentNumber");
        this.setReadOnly("terms");
      }
    },
    taxesDidChange: function () {
      this.set("taxTotal", this.calculateTaxTotal());
    },

    /**
      Calculated sum of taxes
    */
    calculateTaxTotal: function () {
      var taxes = this.get("taxes"),
        amounts = []; // get amounts from taxes.models
      return _.reduce(amounts, function (num, memo) {
        return num + memo;
      }, 0);
    },

    /**
      Calculated value of amount - paid
    */
    calculateBalance: function () {
      var amount = this.get("amount"),
        paid = this.get("paid");
      return amount - paid;
    },

    /**
      Commission should be re-calculated as customer.commission * amount
    */
    calculateCommission: function () {
      var customer = this.get("customer"),
        amount = this.get("amount");
      if (customer) {
        return customer.get("commission") * amount;
      }
      return 0;
    },

    /**
      Copy the terms, currency, and salesRep from the
      customer
    */
    copyFromCustomer: function () {
      var customer = this.get("customer");
      if (customer) {
        this.set("terms", customer.get("terms"));
        this.set("currency", customer.get("currency"));
        this.set("salesRep", customer.get("salesRep"));
      } else {
        this.set("terms", null);
        this.set("currency", null);
        this.set("salesRep", null);
      }
    },

    createCreditMemo: function (params, options) {
      return this.dispatch("XM.Receivable", "createCreditMemo", params, options);
    },

    createDebitMemo: function (params, options) {
      return this.dispatch("XM.Receivable", "createDebitMemo", params, options);
    },

    save: function (key, value, options) {
      if (this.getStatus() === XM.Model.READY_NEW) {
        options = options ? _.clone(options) : {};
        var that = this,
          success;

        // Handle both `"key", value` and `{key: value}` -style arguments.
        if (_.isObject(key) || _.isEmpty(key)) {
          options = value ? _.clone(value) : {};
        } else {
          options = options ? _.clone(options) : {};
        }

        // validate before dispatch
        if (!this.validate()) {
          return false;
        }

        success = options.success;

        var recOptions = {},
          params = [
            that.id,
            that.get("customer").id,
            that.get("documentNumber"),
            that.get("documentDate"),
            that.get("amount"),
            that.get("dueDate"),
            that.get("currency").id,
            that.get("commission"),
            that.get("orderNumber"),
            that.get("notes"),
            that.get("terms").id,
            that.get("reasonCode").id,
            that.get("salesRep").id,
            that.get("paid")
          ];

        recOptions.success = function (resp) {
          that.setStatus(XM.Model.READY_CLEAN, options);
          if (success) { success(that, resp, options); }
        };
        recOptions.error = function () {};

        if (this.isCredit()) {
          this.createCreditMemo(params, recOptions);
        } else if (this.isDebit()) {
          this.createDebitMemo(params, recOptions);
        }
        return this;
      }
      return XM.Model.prototype.save.call(this, key, value, options);
    },

    /**
      The amount must be greater than zero
      The taxTotal may not be greater than the amount
    */
    validate: function () {
      var amount = this.get("amount") || 0,
        taxTotal = this.get("taxTotal") || 0,
        params;

      if (amount <= 0) {
        params = {attr: "_amount".loc(), value: amount};
        return XT.Error.clone('xt1013', { params: params });
      }
      if (Math.max(taxTotal, amount) === taxTotal) {
        return XT.Error.clone('xt2024');
      }
      return XM.Document.prototype.validate.apply(this, arguments);
    }
  });

  XM.ReceivableMixin = {
    /**
      * Returns a boolean true if the value the documentType attribute
      * is XM.Receivable.DEBIT_MEMO or XM.Receivable.INVOICE, otherwise false
      * @returns {Boolean}
    */
    isDebit: function () {
      if (this.get("documentType") === XM.Receivable.DEBIT_MEMO ||
        this.get("documentType") === XM.Receivable.INVOICE) {
        return true;
      }
      return false;
    },

    /**
      * Returns a boolean true if the value the documentType attribute
      * is XM.Receivable.CREDIT_MEMO or XM.Receivable.INVOICE, otherwise false
      * @returns {Boolean}
    */
    isCredit: function () {
      if (this.get("documentType") === XM.Receivable.CREDIT_MEMO ||
        this.get("documentType") === XM.Receivable.INVOICE) {
        return true;
      }
      return false;
    }
  };

  XM.Receivable = XM.Receivable.extend(XM.ReceivableMixin);

  _.extend(XM.Receivable, {
    /** @scope XM.Receivable */

    // ..........................................................
    // CONSTANTS
    //

    /**
      @static
      @constant
      @type String
      @default I
    */
    INVOICE: 'I',

    /**
      @static
      @constant
      @type String
      @default D
    */
    DEBIT_MEMO: 'D',

    /**
      @static
      @constant
      @type String
      @default C
    */
    CREDIT_MEMO: 'C',

    /**
      @static
      @constant
      @type String
      @default R
    */
    CUSTOMER_DEPOSIT: 'R'

  });

  /**
    @class XM.ReceivableTax

    @extends XM.Model
  */
  XM.ReceivableTax = XM.Model.extend({
    recordType: 'XM.ReceivableTax',
    idAttribute: "uuid"
  });

  /**
    @class XM.ReceivableApplication

    @extends XM.Model
  */
  XM.ReceivableApplication = XM.Model.extend({
    recordType: 'XM.ReceivableApplication',
    idAttribute: "uuid"
  });

  /**
    @class XM.ReceivableListItem

    @extends XM.Model
  */
  XM.ReceivableListItem = XM.Info.extend({
    recordType: 'XM.ReceivableListItem',
    idAttribute: "uuid",
    editableModel: 'XM.Receivable',

    canOpen: function (callback) {
      var canView = XT.session.privileges.get("ViewAROpenItems") && this.get("isPosted");
      if (callback) {
        callback(canView);
      }
      return canView;
    },
  });

  // ..........................................................
  // COLLECTIONS
  //

  /**
    @class XM.ReceivableListItemCollection

    @extends XM.Collection
  */
  XM.ReceivableListItemCollection = XM.Collection.extend({
    /** @scope XM.ReceivableListItemCollection.prototype */

    model: XM.ReceivableListItem

  });

  /**
    @class XM.ReceivableTaxCollection

    @extends XM.Collection
  */
  XM.ReceivableTaxCollection = XM.Collection.extend({
    /** @scope XM.ReceivableTaxCollection.prototype */

    model: XM.ReceivableTax

  });

  /**
    @class XM.ReceivableApplicationCollection

    @extends XM.Collection
  */
  XM.ReceivableApplicationCollection = XM.Collection.extend({
    /** @scope XM.ReceivableTaxCollection.prototype */

    model: XM.ReceivableApplication

  });

};
