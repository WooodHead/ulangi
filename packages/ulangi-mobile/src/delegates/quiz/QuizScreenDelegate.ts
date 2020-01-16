/*
 * Copyright (c) Minh Loi.
 *
 * This file is part of Ulangi which is released under GPL v3.0.
 * See LICENSE or go to https://www.gnu.org/licenses/gpl-3.0.txt
 */

import { ActionType, createAction } from '@ulangi/ulangi-action';
import { ErrorCode, ScreenName } from '@ulangi/ulangi-common/enums';
import { ErrorBag, Vocabulary } from '@ulangi/ulangi-common/interfaces';
import { EventBus, group, on, once } from '@ulangi/ulangi-event';
import {
  ObservableConverter,
  ObservableQuizScreen,
  ObservableSetStore,
  ObservableVocabulary,
} from '@ulangi/ulangi-observable';
import { boundClass } from 'autobind-decorator';
import { observable, toJS } from 'mobx';

import { RemoteLogger } from '../../RemoteLogger';
import { config } from '../../constants/config';
import { LightBoxDialogIds } from '../../constants/ids/LightBoxDialogIds';
import { CategoryMessageDelegate } from '../category/CategoryMessageDelegate';
import { DialogDelegate } from '../dialog/DialogDelegate';
import { NavigatorDelegate } from '../navigator/NavigatorDelegate';
import { QuizSettingsDelegate } from './QuizSettingsDelegate';

@boundClass
export class QuizScreenDelegate {
  private eventBus: EventBus;
  private setStore: ObservableSetStore;
  private observableConverter: ObservableConverter;
  private observableScreen: ObservableQuizScreen;
  private quizSettingsDelegate: QuizSettingsDelegate;
  private categoryMessageDelegate: CategoryMessageDelegate;
  private dialogDelegate: DialogDelegate;
  private navigatorDelegate: NavigatorDelegate;

  public constructor(
    eventBus: EventBus,
    setStore: ObservableSetStore,
    observableConverter: ObservableConverter,
    observableScreen: ObservableQuizScreen,
    quizSettingsDelegate: QuizSettingsDelegate,
    categoryMessageDelegate: CategoryMessageDelegate,
    dialogDelegate: DialogDelegate,
    navigatorDelegate: NavigatorDelegate,
  ) {
    this.eventBus = eventBus;
    this.setStore = setStore;
    this.observableConverter = observableConverter;
    this.observableScreen = observableScreen;
    this.quizSettingsDelegate = quizSettingsDelegate;
    this.categoryMessageDelegate = categoryMessageDelegate;
    this.dialogDelegate = dialogDelegate;
    this.navigatorDelegate = navigatorDelegate;
  }

  public startWritingQuiz(): void {
    RemoteLogger.logEvent('start_writing_quiz');
    const {
      vocabularyPool,
      writingQuizLimit,
    } = this.quizSettingsDelegate.getCurrentSettings();

    this.eventBus.pubsub(
      createAction(ActionType.QUIZ__FETCH_VOCABULARY_FOR_WRITING, {
        setId: this.setStore.existingCurrentSetId,
        vocabularyPool,
        limit: writingQuizLimit,
        selectedCategoryNames: toJS(
          this.observableScreen.selectedCategoryNames,
        ),
      }),
      group(
        on(
          ActionType.QUIZ__FETCHING_VOCABULARY_FOR_WRITING,
          this.showPreparingDialog,
        ),
        once(
          ActionType.QUIZ__FETCH_VOCABULARY_FOR_WRITING_SUCCEEDED,
          ({ vocabularyList }): void =>
            this.showPrepareSucceededDialog(vocabularyList, 'writing-quiz'),
        ),
        once(
          ActionType.QUIZ__FETCH_VOCABULARY_FOR_WRITING_FAILED,
          (errorBag): void => {
            if (
              errorBag.errorCode === ErrorCode.QUIZ__INSUFFICIENT_VOCABULARY
            ) {
              this.showNotEnoughTermsDialog('writing-quiz', vocabularyPool);
            } else {
              this.showPrepareFailedDialog(errorBag);
            }
          },
        ),
      ),
    );
  }

  public startMultipleChoiceQuiz(): void {
    RemoteLogger.logEvent('start_multiple_choice_quiz');
    const {
      vocabularyPool,
      multipleChoiceQuizLimit,
    } = this.quizSettingsDelegate.getCurrentSettings();

    this.eventBus.pubsub(
      createAction(ActionType.QUIZ__FETCH_VOCABULARY_FOR_MULTIPLE_CHOICE, {
        setId: this.setStore.existingCurrentSetId,
        vocabularyPool,
        limit: multipleChoiceQuizLimit,
        selectedCategoryNames: toJS(
          this.observableScreen.selectedCategoryNames,
        ),
      }),
      group(
        on(
          ActionType.QUIZ__FETCHING_VOCABULARY_FOR_MULTIPLE_CHOICE,
          this.showPreparingDialog,
        ),
        once(
          ActionType.QUIZ__FETCH_VOCABULARY_FOR_MULTIPLE_CHOICE_SUCCEEDED,
          ({ vocabularyList }): void =>
            this.showPrepareSucceededDialog(
              vocabularyList,
              'multiple-choice-quiz',
            ),
        ),
        once(
          ActionType.QUIZ__FETCH_VOCABULARY_FOR_MULTIPLE_CHOICE_FAILED,
          (errorBag): void => {
            if (
              errorBag.errorCode === ErrorCode.QUIZ__INSUFFICIENT_VOCABULARY
            ) {
              this.showNotEnoughTermsDialog(
                'multiple-choice-quiz',
                vocabularyPool,
              );
            } else {
              this.showPrepareFailedDialog(errorBag);
            }
          },
        ),
      ),
    );
  }

  public showSettings(): void {
    this.navigatorDelegate.push(ScreenName.QUIZ_SETTINGS_SCREEN, {});
  }

  public showSelectSpecificCategoryMessage(): void {
    this.categoryMessageDelegate.showSelectSpecificCategoryMessage();
  }

  private showPreparingDialog(): void {
    this.dialogDelegate.show({
      message: 'Preparing. Please wait...',
    });
  }

  private showPrepareSucceededDialog(
    vocabularyList: readonly Vocabulary[],
    quizType: 'writing-quiz' | 'multiple-choice-quiz',
  ): void {
    this.dialogDelegate.dismiss();

    const observableVocabularyList = observable.map(
      vocabularyList.map(
        (vocabulary): [string, ObservableVocabulary] => {
          return [
            vocabulary.vocabularyId,
            this.observableConverter.convertToObservableVocabulary(vocabulary),
          ];
        },
      ),
    );

    if (quizType === 'writing-quiz') {
      this.navigatorDelegate.push(ScreenName.QUIZ_WRITING_SCREEN, {
        vocabularyList: observableVocabularyList,
        startWritingQuiz: this.startWritingQuiz,
      });
    } else {
      this.navigatorDelegate.push(ScreenName.QUIZ_MULTIPLE_CHOICE_SCREEN, {
        vocabularyList: observableVocabularyList,
        startMultipleChoiceQuiz: this.startMultipleChoiceQuiz,
      });
    }
  }

  private showNotEnoughTermsDialog(
    quizType: 'writing-quiz' | 'multiple-choice-quiz',
    vocabularyPool: 'learned' | 'active',
  ): void {
    const minRequired =
      quizType === 'writing-quiz'
        ? config.quiz.minPerWritingQuiz
        : config.quiz.minPerMultipleChoiceQuiz;

    const message =
      vocabularyPool === 'learned'
        ? `A minimum of ${minRequired} learned terms are required. Based on the settings, the quiz test only terms that you learned.`
        : `A minimum of ${minRequired} terms are required. Please add more terms.`;

    this.dialogDelegate.show({
      testID: LightBoxDialogIds.FAILED_DIALOG,
      message,
      title: 'FAILED TO START',
      showCloseButton: true,
      closeOnTouchOutside: true,
    });
  }

  private showPrepareFailedDialog(errorBag: ErrorBag): void {
    this.dialogDelegate.showFailedDialog(errorBag, {
      title: 'FAILED TO START QUIZ',
    });
  }
}
