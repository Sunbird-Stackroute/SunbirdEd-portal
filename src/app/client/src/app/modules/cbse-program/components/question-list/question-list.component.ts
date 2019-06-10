import { Component, OnInit, AfterViewInit, Output, EventEmitter, Input, ChangeDetectorRef, OnChanges } from '@angular/core';
import { ConfigService, ToasterService, IUserData } from '@sunbird/shared';
import { UserService, PublicDataService, ActionService } from '@sunbird/core';
import { TelemetryService } from '@sunbird/telemetry';
import { tap, map } from 'rxjs/operators';
import * as _ from 'lodash-es';
import { of } from 'rxjs';
import { FormArray, FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { CbseProgramService } from '../../services';
@Component({
  selector: 'app-question-list',
  templateUrl: './question-list.component.html',
  styleUrls: ['./question-list.component.css']
})
export class QuestionListComponent implements OnInit, OnChanges {
  @Input() selectedAttributes: any;
  @Input() role: any;

  public questionList = [];
  public selectedQuestionId: any;
  public questionReadApiDetails: any = {};
  public questionMetaData: any;
  public refresh = true;
  public showLoader = true;
  public enableRoleChange = false;
  public selectedQuestions: FormGroup;
  constructor(private configService: ConfigService, private userService: UserService, private publicDataService: PublicDataService,
    public actionService: ActionService, private cdr: ChangeDetectorRef, public toasterService: ToasterService,
    public telemetryService: TelemetryService, private fb: FormBuilder, private cbseService: CbseProgramService) {
  }
  ngOnChanges(changedProps: any) {
    if (this.enableRoleChange) {
      this.fetchQuestionWithRole();
    }
  }
  ngOnInit() {
    console.log('changes detected in question list', this.role);
    this.fetchQuestionWithRole();
    this.enableRoleChange = true;
    this.selectedQuestions = this.fb.group({
      questions: this.fb.array([])
    });
  }
  private fetchQuestionWithRole() {
    (this.role.currentRole === 'REVIEWER') ? this.fetchQuestionList(true) : this.fetchQuestionList();
  }
  private fetchQuestionList(isReviewer?: boolean) {
    const req = {
      url: `${this.configService.urlConFig.URLS.COMPOSITE.SEARCH}`,
      data: {
        'request': {
          'filters': {
            'objectType': 'AssessmentItem',
            'board': this.selectedAttributes.board,
            'framework': this.selectedAttributes.framework,
            'gradeLevel': this.selectedAttributes.gradeLevel,
            'subject': this.selectedAttributes.subject,
            'medium': this.selectedAttributes.medium,
            'type': this.selectedAttributes.questionType === 'mcq' ? 'mcq' : 'reference',
            'category': this.selectedAttributes.questionType.toUpperCase(),
            'topic': this.selectedAttributes.topic,
            'createdBy': this.userService.userid,
            'programId': this.selectedAttributes.programId,
            'version': 3,
            'status': []
          },
          'sort_by': { 'createdOn': 'desc' }
        }
      }
    };
    if (isReviewer) {
      delete req.data.request.filters.createdBy;
      if (this.selectedAttributes.selectedSchoolForReview) {
        req.data.request.filters['organisation'] = this.selectedAttributes.selectedSchoolForReview;
      }
      req.data.request.filters.status = ['Review'];
    }
    if (this.role.currentRole === "PUBLISHER") {
      delete req.data.request.filters.createdBy;
      req.data.request.filters.status = ['Live'];
    }
    this.publicDataService.post(req).pipe(tap(data => this.showLoader = false))
      .subscribe((res) => {
        this.questionList = res.result.items || [];
        if (this.questionList.length) {
          this.selectedQuestionId = this.questionList[0].identifier;
          this.handleQuestionTabChange(this.selectedQuestionId);
        }
      }, err => {
        this.toasterService.error(_.get(err, 'error.params.errmsg') || 'Fetching question list failed');
        const telemetryErrorData = {
          context: {
            env: 'cbse_program'
          },
          edata: {
            err: err.status.toString(),
            errtype: 'PROGRAMPORTAL',
            stacktrace: _.get(err, 'error.params.errmsg') || 'Fetching question list failed'
          }
        };
        this.telemetryService.error(telemetryErrorData);
      });
  }
  handleQuestionTabChange(questionId) {
    this.selectedQuestionId = questionId;
    this.showLoader = true;
    this.getQuestionDetails(questionId).pipe(tap(data => this.showLoader = false))
      .subscribe((assessment_item) => {
        let editorMode;
        if (['Draft', 'Review', 'Reject'].includes(assessment_item.status)) {
          editorMode = 'edit';
        } else {
          editorMode = 'view';
        }
        this.questionMetaData = {
          mode: editorMode,
          data: assessment_item
        };
        this.refreshEditor();
      }, err => {
        this.toasterService.error(_.get(err, 'error.params.errmsg') || 'Fetching question failed');
        const telemetryErrorData = {
          context: {
            env: 'cbse_program'
          },
          edata: {
            err: err.status.toString(),
            errtype: 'PROGRAMPORTAL',
            stacktrace: _.get(err, 'error.params.errmsg') || 'Fetching question list failed'
          }
        };
        this.telemetryService.error(telemetryErrorData);
      });
  }
  public getQuestionDetails(questionId) {
    if (this.questionReadApiDetails[questionId]) {
      return of(this.questionReadApiDetails[questionId]);
    }
    const req = {
      url: `${this.configService.urlConFig.URLS.ASSESSMENT.READ}/${questionId}`
    };
    return this.actionService.get(req).pipe(map( res => {
      this.questionReadApiDetails[questionId] = res.result.assessment_item;
      return res.result.assessment_item;
    }));
  }
  public createNewQuestion(): void {
    this.questionMetaData = {
      mode: 'create'
    };
    this.refreshEditor();
  }
  public questionStatusHandler(event) {
    console.log('editor event', event);
    if (event.type === 'close') {
      this.questionMetaData = {};
      if (this.questionList.length) {
        this.handleQuestionTabChange(this.selectedQuestionId);
      }
      return;
    }
    if (event.status === 'failed') {
      console.log('failed');
    } else {
      if (event.type === 'update') {
        delete this.questionReadApiDetails[event.identifier];
        this.handleQuestionTabChange(this.selectedQuestionId);
      } if (event.type === 'Reject' || event.type === 'Live') {
        this.showLoader = true;
        setTimeout(() => this.fetchQuestionList(true), 2000);
      } else {
        this.showLoader = true;
        setTimeout(() => this.fetchQuestionList(), 2000);
      }
    }
  }

  handleRefresEvent() {
    this.refreshEditor();
  }
  private refreshEditor() {
    this.refresh = false;
    this.cdr.detectChanges();
    this.refresh = true;
  }

  selectQuestions(questionId: string, isChecked: Boolean) {
    const selectedQuestionsArray = <FormArray>this.selectedQuestions.controls.questions;
    if (isChecked) {
      selectedQuestionsArray.push(new FormControl(questionId));
    } else {
      let index = selectedQuestionsArray.controls.findIndex(x => x.value == questionId)
      selectedQuestionsArray.removeAt(index);
    }
  }

  publishQuestions() {
    let questionIds = this.selectedQuestions.value;
    this.cbseService.getECMLJSON(questionIds.questions).subscribe((theme) => {
      // theme object 
      console.log(theme);
      // preparing request object
      let data: any = {};
      data.name = `${this.selectedAttributes.questionType}-${this.selectedAttributes.topic}`;
      data.description = '';
      data.icon = '';
      data.contentType = 'resource';
      data.board = this.selectedAttributes.board;
      data.medium = this.selectedAttributes.medium;
      data.subject = this.selectedAttributes.subject;
      data.class = this.selectedAttributes.gradeLevel;
      data.topic = this.selectedAttributes.topic;
      data.creators = _.uniq(this.cbseService.creators);
      data.contributors = ''
      data.creditTo =  ''
      console.log(data);
    })


  }
}
